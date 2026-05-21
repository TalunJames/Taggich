"""
Taggich — Immich tag manager backend.

Serves the React UI and exposes a JSON API that wraps Immich. Credentials are
persisted in $CONFIG_DIR/config.json (default /data) so the user enters them
once via the in-app Setup screen and they survive container restarts.

Env vars (all optional):
  CONFIG_DIR        Where to store config.json (default: /data)
  IMMICH_URL        Pre-seed the Immich URL if no config.json yet
  IMMICH_API_KEY    Pre-seed the API key if no config.json yet
  PORT              Listen port (default: 5000)
  HOST              Bind host (default: 0.0.0.0)
"""

import functools
import json
import os
import socket
import sys
import threading
from typing import Dict, List, Optional

import requests
from flask import Flask, Response, g, jsonify, render_template, request


# ─── Immich client ──────────────────────────────────────────────────────────


class ImmichClient:
    """Minimal Immich REST client."""

    def __init__(self, base_url: str, api_key: str) -> None:
        if not base_url.endswith("/api"):
            base_url = base_url.rstrip("/") + "/api"
        self.base_url = base_url
        self.api_key = api_key
        self.session = requests.Session()

    def _headers(self) -> Dict[str, str]:
        return {"x-api-key": self.api_key, "Accept": "application/json"}

    # connection check
    def ping(self) -> Dict:
        r = self.session.get(f"{self.base_url}/server/version", headers=self._headers(), timeout=10)
        if r.status_code == 404:
            # Older Immich exposes /server-info/version
            r = self.session.get(f"{self.base_url}/server-info/version", headers=self._headers(), timeout=10)
        r.raise_for_status()
        try:
            return r.json()
        except ValueError:
            return {}

    # albums
    def get_albums(self) -> List[Dict]:
        r = self.session.get(f"{self.base_url}/albums", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def get_album(self, album_id: str) -> Dict:
        r = self.session.get(f"{self.base_url}/albums/{album_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def rename_album(self, album_id: str, new_name: str) -> Dict:
        r = self.session.patch(
            f"{self.base_url}/albums/{album_id}",
            headers=self._headers(),
            json={"albumName": new_name},
        )
        r.raise_for_status()
        return r.json()

    # assets
    def get_asset(self, asset_id: str) -> Dict:
        r = self.session.get(f"{self.base_url}/assets/{asset_id}", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def delete_assets(self, asset_ids: List[str], force: bool = False) -> None:
        r = self.session.delete(
            f"{self.base_url}/assets",
            headers=self._headers(),
            json={"ids": asset_ids, "force": force},
        )
        r.raise_for_status()

    def stream_asset(self, asset_id: str, range_header: Optional[str] = None):
        url = f"{self.base_url}/assets/{asset_id}/original"
        headers = self._headers()
        if range_header:
            headers["Range"] = range_header
        return self.session.get(url, headers=headers, stream=True)

    def get_thumbnail(self, asset_id: str, size: str = "preview") -> requests.Response:
        url = f"{self.base_url}/assets/{asset_id}/thumbnail"
        r = self.session.get(url, headers=self._headers(), params={"size": size}, stream=True)
        r.raise_for_status()
        return r

    # tags
    def get_tags(self) -> List[Dict]:
        r = self.session.get(f"{self.base_url}/tags", headers=self._headers())
        r.raise_for_status()
        return r.json()

    def create_tag(self, name: str, color: Optional[str] = None) -> Dict:
        payload: Dict = {"name": name}
        if color:
            payload["color"] = color
        r = self.session.post(f"{self.base_url}/tags", headers=self._headers(), json=payload)
        if r.status_code == 405:
            r = self.session.put(f"{self.base_url}/tags", headers=self._headers(), json=payload)
        r.raise_for_status()
        return r.json()

    def update_tag(self, tag_id: str, name: Optional[str] = None, color: Optional[str] = None) -> Dict:
        payload: Dict = {}
        if name is not None:
            payload["name"] = name
        if color is not None:
            payload["color"] = color
        r = self.session.put(
            f"{self.base_url}/tags/{tag_id}", headers=self._headers(), json=payload
        )
        r.raise_for_status()
        return r.json()

    def delete_tag(self, tag_id: str) -> None:
        r = self.session.delete(f"{self.base_url}/tags/{tag_id}", headers=self._headers())
        r.raise_for_status()

    def tag_assets(self, tag_id: str, asset_ids: List[str]) -> None:
        r = self.session.put(
            f"{self.base_url}/tags/{tag_id}/assets",
            headers=self._headers(),
            json={"ids": asset_ids},
        )
        r.raise_for_status()

    def untag_assets(self, tag_id: str, asset_ids: List[str]) -> None:
        r = self.session.delete(
            f"{self.base_url}/tags/{tag_id}/assets",
            headers=self._headers(),
            json={"ids": asset_ids},
        )
        r.raise_for_status()

    def search_assets_by_tag(self, tag_id: str, size: int = 1000) -> List[Dict]:
        r = self.session.post(
            f"{self.base_url}/search/metadata",
            headers=self._headers(),
            json={"tagIds": [tag_id], "size": size},
        )
        r.raise_for_status()
        data = r.json()
        return data.get("assets", {}).get("items", [])

    def search_assets_by_album(self, album_id: str, size: int = 1000) -> List[Dict]:
        """Use /search/metadata so the returned assets include full tag info.

        The /albums/<id> endpoint in some Immich versions strips per-asset
        tag arrays, which makes "X% tagged" look like 0% everywhere. The
        metadata search reliably returns AssetResponseDto with tags.
        """
        items: List[Dict] = []
        page = 1
        while True:
            r = self.session.post(
                f"{self.base_url}/search/metadata",
                headers=self._headers(),
                json={"albumIds": [album_id], "size": size, "page": page},
            )
            r.raise_for_status()
            block = r.json().get("assets", {}) or {}
            chunk = block.get("items", []) or []
            items.extend(chunk)
            next_page = block.get("nextPage")
            if not next_page or len(chunk) < size:
                break
            try:
                page = int(next_page)
            except (TypeError, ValueError):
                break
        return items


# ─── Config persistence ─────────────────────────────────────────────────────


CONFIG_DIR = os.environ.get("CONFIG_DIR", "/data")
CONFIG_FILE = os.path.join(CONFIG_DIR, "config.json")

_client: Optional[ImmichClient] = None
_client_lock = threading.Lock()


def _load_config() -> Optional[Dict[str, str]]:
    """Return persisted config from disk, falling back to env vars."""
    if os.path.exists(CONFIG_FILE):
        try:
            with open(CONFIG_FILE, "r") as f:
                data = json.load(f)
            if data.get("immich_url") and data.get("immich_api_key"):
                return {
                    "immich_url": data["immich_url"],
                    "immich_api_key": data["immich_api_key"],
                }
        except (json.JSONDecodeError, OSError) as e:
            print(f"⚠️  Failed to read {CONFIG_FILE}: {e}", file=sys.stderr)
    url = os.environ.get("IMMICH_URL", "").strip()
    key = os.environ.get("IMMICH_API_KEY", "").strip()
    if url and key:
        return {"immich_url": url, "immich_api_key": key}
    return None


def _save_config(immich_url: str, api_key: str) -> None:
    os.makedirs(CONFIG_DIR, exist_ok=True)
    tmp = CONFIG_FILE + ".tmp"
    with open(tmp, "w") as f:
        json.dump({"immich_url": immich_url, "immich_api_key": api_key}, f)
    os.replace(tmp, CONFIG_FILE)
    try:
        os.chmod(CONFIG_FILE, 0o600)
    except OSError:
        pass


def _clear_config() -> None:
    try:
        os.remove(CONFIG_FILE)
    except FileNotFoundError:
        pass


def get_client() -> Optional[ImmichClient]:
    """Lazily build the Immich client from the persisted config."""
    global _client
    if _client is not None:
        return _client
    with _client_lock:
        if _client is not None:
            return _client
        cfg = _load_config()
        if not cfg:
            return None
        _client = ImmichClient(cfg["immich_url"], cfg["immich_api_key"])
        return _client


def reset_client() -> None:
    global _client
    with _client_lock:
        _client = None


# ─── Flask app ───────────────────────────────────────────────────────────────


app = Flask(__name__, template_folder="templates", static_folder="static")


def needs_client(fn):
    """Decorator: 503 the route until Immich credentials are configured."""

    @functools.wraps(fn)
    def wrapper(*args, **kwargs):
        c = get_client()
        if c is None:
            return jsonify({"error": "Not configured", "code": "NOT_CONFIGURED"}), 503
        g.client = c
        return fn(*args, **kwargs)

    return wrapper


def _err(e: Exception, status: int = 500):
    msg = str(e)
    if isinstance(e, requests.HTTPError) and e.response is not None:
        try:
            body = e.response.json()
            msg = body.get("message") or body.get("error") or msg
        except ValueError:
            msg = e.response.text or msg
        status = e.response.status_code
    return jsonify({"error": msg}), status


# ─── Page ────────────────────────────────────────────────────────────────────


@app.route("/")
def index():
    c = get_client()
    immich_base = c.base_url.replace("/api", "") if c else ""
    return render_template("index.html", immich_url=immich_base)


# ─── Config / setup ──────────────────────────────────────────────────────────


@app.route("/api/config/status")
def config_status():
    cfg = _load_config()
    return jsonify({
        "configured": bool(cfg),
        "immich_url": cfg["immich_url"] if cfg else None,
    })


@app.route("/api/config/test", methods=["POST"])
def config_test():
    payload = request.get_json(force=True) or {}
    url = (payload.get("immich_url") or "").strip()
    key = (payload.get("immich_api_key") or "").strip()
    if not url or not key:
        return jsonify({"error": "immich_url and immich_api_key required"}), 400
    try:
        info = ImmichClient(url, key).ping()
        return jsonify({"success": True, "server": info})
    except requests.HTTPError as e:
        return jsonify({"error": f"Immich rejected the request ({e.response.status_code}). Check your API key."}), 400
    except requests.ConnectionError:
        return jsonify({"error": "Couldn't reach that URL. Check it's correct and reachable from the container."}), 400
    except Exception as e:
        return jsonify({"error": str(e)}), 400


@app.route("/api/config", methods=["POST"])
def config_save():
    payload = request.get_json(force=True) or {}
    url = (payload.get("immich_url") or "").strip()
    key = (payload.get("immich_api_key") or "").strip()
    if not url or not key:
        return jsonify({"error": "immich_url and immich_api_key required"}), 400
    try:
        ImmichClient(url, key).ping()
    except Exception as e:
        return _err(e, 400)
    try:
        _save_config(url, key)
    except OSError as e:
        return jsonify({"error": f"Couldn't write config file: {e}. Check the {CONFIG_DIR} mount."}), 500
    reset_client()
    return jsonify({"success": True})


@app.route("/api/config", methods=["DELETE"])
def config_delete():
    _clear_config()
    reset_client()
    return jsonify({"success": True})


# ─── Library bootstrap ───────────────────────────────────────────────────────


@app.route("/api/library")
@needs_client
def library():
    try:
        return jsonify({"albums": g.client.get_albums(), "tags": g.client.get_tags()})
    except Exception as e:
        return _err(e)


# ─── Albums ──────────────────────────────────────────────────────────────────


@app.route("/api/albums")
@needs_client
def albums():
    try:
        return jsonify(g.client.get_albums())
    except Exception as e:
        return _err(e)


@app.route("/api/albums/<album_id>")
@needs_client
def album_detail(album_id):
    try:
        return jsonify(g.client.get_album(album_id))
    except Exception as e:
        return _err(e)


@app.route("/api/albums/<album_id>/assets")
@needs_client
def album_assets(album_id):
    """Return album assets with full tag info. Tries /search/metadata first
    (reliable per-asset tags); falls back to the album endpoint if that
    isn't available on this Immich version."""
    try:
        assets = g.client.search_assets_by_album(album_id)
        if assets:
            return jsonify(assets)
        # Empty result from search — fall back to the album endpoint, which
        # always lists the assets even if it strips some fields.
        data = g.client.get_album(album_id)
        return jsonify(data.get("assets", []))
    except Exception:
        try:
            data = g.client.get_album(album_id)
            return jsonify(data.get("assets", []))
        except Exception as e2:
            return _err(e2)


@app.route("/api/albums/<album_id>/rename", methods=["POST"])
@needs_client
def rename_album(album_id):
    try:
        payload = request.get_json(force=True) or {}
        new_name = payload.get("new_name") or payload.get("name")
        if not new_name:
            return jsonify({"error": "new_name required"}), 400
        return jsonify({"success": True, "album": g.client.rename_album(album_id, new_name)})
    except Exception as e:
        return _err(e)


# ─── Assets ──────────────────────────────────────────────────────────────────


@app.route("/api/assets/<asset_id>")
@needs_client
def asset_detail(asset_id):
    try:
        return jsonify(g.client.get_asset(asset_id))
    except Exception as e:
        return _err(e)


@app.route("/api/assets/<asset_id>/thumbnail")
@needs_client
def asset_thumbnail(asset_id):
    try:
        size = request.args.get("size", "preview")
        upstream = g.client.get_thumbnail(asset_id, size=size)
        return Response(
            upstream.iter_content(chunk_size=8192),
            mimetype=upstream.headers.get("Content-Type", "image/jpeg"),
        )
    except Exception as e:
        return _err(e)


@app.route("/api/assets/<asset_id>/stream")
@needs_client
def asset_stream(asset_id):
    try:
        range_header = request.headers.get("Range")
        upstream = g.client.stream_asset(asset_id, range_header)
        upstream.raise_for_status()
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": upstream.headers.get("Content-Type", "application/octet-stream"),
        }
        status = upstream.status_code
        if "Content-Length" in upstream.headers:
            headers["Content-Length"] = upstream.headers["Content-Length"]
        if status == 206 and "Content-Range" in upstream.headers:
            headers["Content-Range"] = upstream.headers["Content-Range"]
        return Response(
            upstream.iter_content(chunk_size=64 * 1024),
            status=status,
            headers=headers,
        )
    except Exception as e:
        return _err(e)


@app.route("/api/delete-asset", methods=["POST"])
@needs_client
def delete_asset():
    try:
        payload = request.get_json(force=True) or {}
        asset_id = payload.get("asset_id")
        if not asset_id:
            return jsonify({"error": "asset_id required"}), 400
        g.client.delete_assets([asset_id])
        return jsonify({"success": True})
    except Exception as e:
        return _err(e)


# ─── Tags ────────────────────────────────────────────────────────────────────


@app.route("/api/tags")
@needs_client
def tags():
    try:
        return jsonify(g.client.get_tags())
    except Exception as e:
        return _err(e)


@app.route("/api/tags", methods=["POST"])
@needs_client
def create_tag():
    try:
        payload = request.get_json(force=True) or {}
        name = (payload.get("name") or "").strip()
        if not name:
            return jsonify({"error": "name required"}), 400
        return jsonify(g.client.create_tag(name=name, color=payload.get("color")))
    except Exception as e:
        return _err(e)


@app.route("/api/tags/<tag_id>", methods=["PUT"])
@needs_client
def update_tag(tag_id):
    try:
        payload = request.get_json(force=True) or {}
        return jsonify(g.client.update_tag(tag_id, name=payload.get("name"), color=payload.get("color")))
    except Exception as e:
        return _err(e)


@app.route("/api/tags/<tag_id>", methods=["DELETE"])
@needs_client
def delete_tag(tag_id):
    try:
        g.client.delete_tag(tag_id)
        return jsonify({"success": True})
    except Exception as e:
        return _err(e)


@app.route("/api/tags/<tag_id>/assets")
@needs_client
def tag_assets_list(tag_id):
    try:
        size = int(request.args.get("size", "1000"))
        return jsonify(g.client.search_assets_by_tag(tag_id, size=size))
    except Exception as e:
        return _err(e)


@app.route("/api/tags/<src_id>/merge", methods=["POST"])
@needs_client
def merge_tag(src_id):
    try:
        payload = request.get_json(force=True) or {}
        into_id = payload.get("into") or payload.get("into_id")
        if not into_id:
            return jsonify({"error": "into required"}), 400
        if into_id == src_id:
            return jsonify({"error": "cannot merge a tag into itself"}), 400
        src_assets = g.client.search_assets_by_tag(src_id)
        asset_ids = [a["id"] for a in src_assets if a.get("id")]
        if asset_ids:
            g.client.tag_assets(into_id, asset_ids)
        g.client.delete_tag(src_id)
        return jsonify({"success": True, "moved": len(asset_ids)})
    except Exception as e:
        return _err(e)


# ─── Tag <-> asset toggle (backwards-compat with old client) ────────────────


@app.route("/api/tag-asset", methods=["POST"])
@needs_client
def tag_asset_endpoint():
    try:
        payload = request.get_json(force=True) or {}
        asset_id = payload.get("asset_id")
        tag_name = (payload.get("tag_name") or "").strip()
        color = payload.get("color")
        if not asset_id or not tag_name:
            return jsonify({"error": "asset_id and tag_name required"}), 400
        all_tags = g.client.get_tags()
        match = next((t for t in all_tags if t["name"].lower() == tag_name.lower()), None)
        tag = match if match else g.client.create_tag(tag_name, color=color)
        g.client.tag_assets(tag["id"], [asset_id])
        return jsonify({"success": True, "tag": tag})
    except Exception as e:
        return _err(e)


@app.route("/api/untag-asset", methods=["POST"])
@needs_client
def untag_asset_endpoint():
    try:
        payload = request.get_json(force=True) or {}
        asset_id = payload.get("asset_id")
        tag_id = payload.get("tag_id")
        if not asset_id or not tag_id:
            return jsonify({"error": "asset_id and tag_id required"}), 400
        g.client.untag_assets(tag_id, [asset_id])
        return jsonify({"success": True})
    except Exception as e:
        return _err(e)


# ─── Healthcheck ─────────────────────────────────────────────────────────────


@app.route("/healthz")
def healthz():
    """Liveness probe — always 200 once the process is up."""
    return jsonify({"ok": True})


# ─── Entry point ─────────────────────────────────────────────────────────────


def _get_local_ip() -> str:
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        ip = s.getsockname()[0]
        s.close()
        return ip
    except Exception:
        return "localhost"


def main():
    host = os.environ.get("HOST", "0.0.0.0")
    port = int(os.environ.get("PORT", "5000"))

    cfg = _load_config()
    if cfg:
        print(f"✓ Using configured Immich at {cfg['immich_url']}")
    else:
        print("ℹ️  No Immich credentials yet — open the web UI to run first-time setup.")

    print("\n" + "=" * 60)
    print("🚀 Taggich starting…")
    print("=" * 60)
    print(f"   Local:    http://localhost:{port}")
    print(f"   Network:  http://{_get_local_ip()}:{port}")
    print(f"   Config:   {CONFIG_FILE}")
    print("=" * 60 + "\n")

    # Prefer waitress (production-grade) when available; fall back to Flask dev.
    try:
        from waitress import serve
        serve(app, host=host, port=port, threads=8, ident="taggich")
    except ImportError:
        app.run(host=host, port=port, debug=False, threaded=True)


if __name__ == "__main__":
    main()

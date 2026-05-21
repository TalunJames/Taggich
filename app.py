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
import hashlib
import json
import os
import shutil
import socket
import sys
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from typing import Dict, Iterable, List, Optional, Tuple

import requests
from flask import Flask, Response, g, jsonify, render_template, request


# Tunable via env. Bigger == faster enrichment but more concurrent load on
# the Immich server.
ENRICH_WORKERS = int(os.environ.get("ENRICH_WORKERS", "8"))


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
        """Request a thumbnail at the given size, falling back through the
        known sizes if Immich rejects the requested one (older versions
        don't know about `fullsize`)."""
        url = f"{self.base_url}/assets/{asset_id}/thumbnail"
        # Order: requested → fullsize → preview → thumbnail. dedupe while
        # preserving order.
        seen = set()
        chain = []
        for s in (size, "fullsize", "preview", "thumbnail"):
            if s and s not in seen:
                seen.add(s)
                chain.append(s)
        last_err: Optional[Exception] = None
        for s in chain:
            r = self.session.get(url, headers=self._headers(), params={"size": s}, stream=True)
            if r.status_code == 400 or r.status_code == 422:
                # Unknown enum value for this Immich version — try the next.
                last_err = requests.HTTPError(f"Immich rejected size={s}", response=r)
                continue
            r.raise_for_status()
            return r
        if last_err:
            raise last_err
        raise RuntimeError("no thumbnail size succeeded")

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

    # ── tag / cover enrichment helpers ──────────────────────────────────

    @staticmethod
    def _tags_field_populated(assets: List[Dict]) -> bool:
        """Return True if at least one asset has the `tags` key.

        We use this to detect Immich responses that have stripped per-asset
        tag info. A populated `tags: []` still counts (the field exists).
        Only when the key is completely absent do we treat the response as
        stripped and need per-asset enrichment.
        """
        for a in assets:
            if isinstance(a, dict) and "tags" in a:
                return True
        return False

    def enrich_assets_with_tags(self, assets: List[Dict]) -> List[Dict]:
        """Fill in `tags` on each asset via parallel /assets/<id> fetches."""
        ids = [a.get("id") for a in assets if isinstance(a, dict) and a.get("id")]
        if not ids:
            return assets

        def fetch_one(aid: str):
            try:
                return aid, self.get_asset(aid).get("tags", [])
            except Exception:
                return aid, []

        tags_by_id: Dict[str, List] = {}
        with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as ex:
            for aid, tags in ex.map(fetch_one, ids):
                tags_by_id[aid] = tags
        for a in assets:
            if isinstance(a, dict) and a.get("id") in tags_by_id:
                a["tags"] = tags_by_id[a["id"]]
        return assets

    def enrich_albums_with_covers(self, albums: List[Dict]) -> List[Dict]:
        """Backfill `albumThumbnailAssetId` for albums missing one by
        fetching the album's first asset. Parallelised."""
        need = [a for a in albums if isinstance(a, dict) and not a.get("albumThumbnailAssetId") and a.get("id")]
        if not need:
            return albums

        def fetch_cover(album: Dict):
            try:
                detail = self.get_album(album["id"])
                assets = detail.get("assets") or []
                if assets and isinstance(assets[0], dict):
                    return album["id"], assets[0].get("id")
            except Exception:
                pass
            return album["id"], None

        cover_by_id: Dict[str, Optional[str]] = {}
        with ThreadPoolExecutor(max_workers=ENRICH_WORKERS) as ex:
            for aid, cover in ex.map(fetch_cover, need):
                cover_by_id[aid] = cover
        for a in albums:
            if isinstance(a, dict) and not a.get("albumThumbnailAssetId") and cover_by_id.get(a.get("id")):
                a["albumThumbnailAssetId"] = cover_by_id[a["id"]]
        return albums

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


# ─── Disk cache ──────────────────────────────────────────────────────────────


class FileCache:
    """Tiny content-addressed disk cache for thumbnails and originals.

    Layout: under `root/`, every entry is stored as a pair of files
    `xx/<sha1>.body` (raw bytes) and `xx/<sha1>.ct` (Content-Type, one line).
    The two-char prefix keeps each directory under a sane file count.

    Eviction: cleanup() walks the tree, deletes anything older than
    `max_age` seconds, then deletes oldest-first until total size is under
    `max_bytes` * 0.8 (so we have headroom before the next pass).
    """

    def __init__(self, root: str, max_age: int, max_bytes: int, max_file_bytes: int):
        self.root = root
        self.max_age = max_age
        self.max_bytes = max_bytes
        self.max_file_bytes = max_file_bytes
        os.makedirs(root, exist_ok=True)
        self._lock = threading.Lock()

    def _paths(self, key: str) -> Tuple[str, str]:
        h = hashlib.sha1(key.encode("utf-8")).hexdigest()
        d = os.path.join(self.root, h[:2])
        base = os.path.join(d, h)
        return base + ".body", base + ".ct"

    def get(self, key: str) -> Optional[Tuple[str, str]]:
        body, ct = self._paths(key)
        try:
            st = os.stat(body)
        except FileNotFoundError:
            return None
        if time.time() - st.st_mtime > self.max_age:
            self._unlink(body, ct)
            return None
        try:
            with open(ct, "r") as f:
                content_type = f.read().strip() or "application/octet-stream"
        except FileNotFoundError:
            self._unlink(body, ct)
            return None
        # touch for LRU-style retention
        try:
            os.utime(body, None)
        except OSError:
            pass
        return content_type, body

    def invalidate(self, key: str) -> None:
        body, ct = self._paths(key)
        self._unlink(body, ct)

    def stream_and_cache(
        self, key: str, content_type: str, chunks: Iterable[bytes]
    ) -> Iterable[bytes]:
        """Yield each chunk to the caller while also writing to a temp
        file. On clean completion, atomic-rename the temp to its cache
        path. On exception or client disconnect, the temp is removed and
        nothing pollutes the cache."""
        body, ct = self._paths(key)
        os.makedirs(os.path.dirname(body), exist_ok=True)
        tmp = body + ".tmp"
        size = 0
        too_big = False
        f = None
        try:
            f = open(tmp, "wb")
            for chunk in chunks:
                if not chunk:
                    continue
                if not too_big:
                    size += len(chunk)
                    if size > self.max_file_bytes:
                        # Stop caching this entry — pass-through the rest.
                        too_big = True
                        try:
                            f.close()
                        except Exception:
                            pass
                        f = None
                        try:
                            os.remove(tmp)
                        except OSError:
                            pass
                    else:
                        f.write(chunk)
                yield chunk
            if f is not None:
                f.close()
                f = None
                with open(ct, "w") as cf:
                    cf.write(content_type)
                os.replace(tmp, body)
        except (Exception, GeneratorExit):
            if f is not None:
                try:
                    f.close()
                except Exception:
                    pass
            try:
                os.remove(tmp)
            except OSError:
                pass
            raise

    def cleanup(self) -> Dict[str, int]:
        """Apply TTL and size policy. Safe to call concurrently."""
        with self._lock:
            now = time.time()
            entries: List[Tuple[float, int, str]] = []
            total = 0
            removed = 0
            for dirpath, _dirs, files in os.walk(self.root):
                for name in files:
                    if not name.endswith(".body"):
                        continue
                    path = os.path.join(dirpath, name)
                    try:
                        st = os.stat(path)
                    except OSError:
                        continue
                    if now - st.st_mtime > self.max_age:
                        self._unlink(path, path[:-5] + ".ct")
                        removed += 1
                        continue
                    entries.append((st.st_mtime, st.st_size, path))
                    total += st.st_size
            if total > self.max_bytes and entries:
                target = int(self.max_bytes * 0.8)
                entries.sort(key=lambda e: e[0])  # oldest first
                while entries and total > target:
                    _mt, sz, path = entries.pop(0)
                    self._unlink(path, path[:-5] + ".ct")
                    total -= sz
                    removed += 1
            return {"files": len(entries), "bytes": total, "removed": removed}

    def stats(self) -> Dict[str, int]:
        files = 0
        total = 0
        for dirpath, _dirs, fnames in os.walk(self.root):
            for name in fnames:
                if not name.endswith(".body"):
                    continue
                try:
                    total += os.path.getsize(os.path.join(dirpath, name))
                    files += 1
                except OSError:
                    pass
        return {"files": files, "bytes": total}

    def clear(self) -> None:
        with self._lock:
            shutil.rmtree(self.root, ignore_errors=True)
            os.makedirs(self.root, exist_ok=True)

    @staticmethod
    def _unlink(*paths: str) -> None:
        for p in paths:
            try:
                os.remove(p)
            except OSError:
                pass


_cache_lock = threading.Lock()
_cache: Optional[FileCache] = None


def get_cache() -> Optional[FileCache]:
    """Build the cache lazily on first use."""
    global _cache
    if os.environ.get("CACHE_ENABLED", "true").lower() in ("0", "false", "no"):
        return None
    if _cache is not None:
        return _cache
    with _cache_lock:
        if _cache is not None:
            return _cache
        cache_dir = os.environ.get("CACHE_DIR", os.path.join(CONFIG_DIR, "cache"))
        max_age = int(os.environ.get("CACHE_MAX_AGE_SECONDS", str(24 * 3600)))
        max_bytes = int(os.environ.get("CACHE_MAX_BYTES", str(2 * 1024 * 1024 * 1024)))
        max_file_bytes = int(os.environ.get("CACHE_MAX_FILE_BYTES", str(200 * 1024 * 1024)))
        try:
            _cache = FileCache(cache_dir, max_age, max_bytes, max_file_bytes)
        except OSError as e:
            print(f"⚠️  Couldn't create cache at {cache_dir}: {e}", file=sys.stderr)
            return None
    return _cache


def _cache_cleanup_loop():
    interval = int(os.environ.get("CACHE_CLEANUP_INTERVAL_SECONDS", "600"))
    while True:
        time.sleep(interval)
        try:
            c = get_cache()
            if c is not None:
                stats = c.cleanup()
                if stats["removed"]:
                    print(f"🧹 cache: removed {stats['removed']} files, "
                          f"now {stats['files']} files / {stats['bytes'] // (1024 * 1024)} MB", file=sys.stderr)
        except Exception as e:
            print(f"⚠️  cache cleanup error: {e}", file=sys.stderr)


def _stream_file(path: str, chunk_size: int = 64 * 1024) -> Iterable[bytes]:
    with open(path, "rb") as f:
        while True:
            chunk = f.read(chunk_size)
            if not chunk:
                return
            yield chunk


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
        albums = g.client.get_albums()
        # Many albums don't have albumThumbnailAssetId set; backfill from the
        # first asset so the Home grid shows real thumbnails immediately.
        g.client.enrich_albums_with_covers(albums)
        return jsonify({"albums": albums, "tags": g.client.get_tags()})
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
    """Return album assets with full tag info.

    Strategy:
      1. Pull the asset list via /albums/<id>. This is the most consistent
         Immich endpoint and on most versions already includes per-asset
         tags.
      2. If the response strips the `tags` key entirely, fall back to
         /search/metadata which is sometimes more verbose.
      3. If tags are STILL missing, fetch each asset's detail in parallel
         (ENRICH_WORKERS at a time) and merge tags back in. This is the slow
         path, but it's the only way to guarantee accuracy on Immich
         versions that strip tags from bulk responses.
    """
    enrich = request.args.get("enrich", "true").lower() not in ("0", "false", "no")
    assets: List[Dict] = []
    try:
        assets = g.client.get_album(album_id).get("assets") or []
    except Exception as e:
        # If /albums/<id> itself fails, we're in trouble — but let's try search.
        try:
            assets = g.client.search_assets_by_album(album_id)
        except Exception:
            return _err(e)

    if assets and not g.client._tags_field_populated(assets):
        # Try search as a second source before going to per-asset enrichment.
        try:
            alt = g.client.search_assets_by_album(album_id)
            if alt and g.client._tags_field_populated(alt):
                assets = alt
        except Exception:
            pass

    if enrich and assets and not g.client._tags_field_populated(assets):
        try:
            g.client.enrich_assets_with_tags(assets)
        except Exception as e:
            print(f"⚠️  enrich_assets_with_tags failed: {e}", file=sys.stderr)

    return jsonify(assets)


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
        cache = get_cache()
        key = f"thumb:{asset_id}:{size}"
        common_headers = {
            "Cache-Control": "public, max-age=86400",
        }
        if cache is not None:
            hit = cache.get(key)
            if hit:
                ct, path = hit
                return Response(
                    _stream_file(path),
                    mimetype=ct,
                    headers={**common_headers, "X-Cache": "HIT"},
                )
        upstream = g.client.get_thumbnail(asset_id, size=size)
        ct = upstream.headers.get("Content-Type", "image/jpeg")
        chunks = upstream.iter_content(chunk_size=64 * 1024)
        if cache is not None:
            chunks = cache.stream_and_cache(key, ct, chunks)
        return Response(
            chunks,
            mimetype=ct,
            headers={**common_headers, "X-Cache": "MISS"},
        )
    except Exception as e:
        return _err(e)


@app.route("/api/assets/<asset_id>/stream")
@needs_client
def asset_stream(asset_id):
    try:
        range_header = request.headers.get("Range")
        # Treat "bytes=0-" as a full request — most browsers send this for
        # the initial video probe but it still gets the entire file.
        is_full_request = (not range_header) or (range_header.strip() == "bytes=0-")
        cache = get_cache()
        key = f"orig:{asset_id}"

        # Cache hit path — only valid for full-content requests.
        if is_full_request and cache is not None:
            hit = cache.get(key)
            if hit:
                ct, path = hit
                size = os.path.getsize(path)
                return Response(
                    _stream_file(path),
                    mimetype=ct,
                    headers={
                        "Accept-Ranges": "bytes",
                        "Cache-Control": "public, max-age=86400",
                        "Content-Length": str(size),
                        "X-Cache": "HIT",
                    },
                )

        # Pass-through (uncached) Range requests + cache-miss full requests.
        upstream = g.client.stream_asset(asset_id, range_header)
        upstream.raise_for_status()
        ct = upstream.headers.get("Content-Type", "application/octet-stream")
        headers = {
            "Accept-Ranges": "bytes",
            "Content-Type": ct,
            "Cache-Control": "public, max-age=86400",
        }
        status = upstream.status_code
        if "Content-Length" in upstream.headers:
            headers["Content-Length"] = upstream.headers["Content-Length"]
        if status == 206 and "Content-Range" in upstream.headers:
            headers["Content-Range"] = upstream.headers["Content-Range"]

        chunks = upstream.iter_content(chunk_size=64 * 1024)
        if is_full_request and cache is not None and status == 200:
            chunks = cache.stream_and_cache(key, ct, chunks)
            headers["X-Cache"] = "MISS"
        return Response(chunks, status=status, headers=headers)
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
        cache = get_cache()
        if cache is not None:
            cache.invalidate(f"orig:{asset_id}")
            for s in ("thumbnail", "preview", "fullsize"):
                cache.invalidate(f"thumb:{asset_id}:{s}")
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


# ─── Cache management ────────────────────────────────────────────────────────


@app.route("/api/cache/status")
def cache_status():
    c = get_cache()
    if c is None:
        return jsonify({"enabled": False})
    stats = c.stats()
    return jsonify({
        "enabled": True,
        "dir": c.root,
        "files": stats["files"],
        "bytes": stats["bytes"],
        "max_bytes": c.max_bytes,
        "max_file_bytes": c.max_file_bytes,
        "max_age_seconds": c.max_age,
    })


@app.route("/api/cache", methods=["DELETE"])
def cache_clear():
    c = get_cache()
    if c is None:
        return jsonify({"enabled": False}), 400
    c.clear()
    return jsonify({"success": True})


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

    # Boot the cache cleanup thread once the cache is ready.
    cache = get_cache()
    if cache is not None:
        print(f"✓ Disk cache enabled at {cache.root} "
              f"(max age {cache.max_age // 3600}h, max {cache.max_bytes // (1024 * 1024)} MB)")
        threading.Thread(target=_cache_cleanup_loop, daemon=True, name="cache-cleanup").start()
    else:
        print("ℹ️  Disk cache disabled.")

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

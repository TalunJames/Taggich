# Taggich

A modern web UI for managing tags in your [Immich](https://immich.app) library.
Browse albums, scrub photos and videos, tag them with ⌘K, and clean up your tag
list — all backed by your existing Immich API.

> **Heads up if you ever ran the original `Old/` version with the bundled
> credentials**: that fallback API key was hardcoded and was visible to anyone
> with read access to this repo. Rotate it from Immich → user settings → API
> keys before you do anything else.

---

## Run it on TrueNAS Scale (recommended)

TrueNAS Scale 24.10+ runs Docker Compose under the hood, so you can deploy
Taggich as a **Custom App**.

1. **Pick a dataset for config.** SSH/Shell into TrueNAS and create a directory
   inside your apps dataset, e.g.:

   ```sh
   mkdir -p /mnt/tank/apps/taggich
   chown -R 1000:1000 /mnt/tank/apps/taggich   # matches the container's UID
   ```

2. **Apps → Discover Apps → Custom App.** Fill in:

   | Field                          | Value                                  |
   | ------------------------------ | -------------------------------------- |
   | Application Name               | `taggich`                              |
   | Image repository               | `ghcr.io/talunjames/taggich`           |
   | Image tag                      | `latest`                               |
   | Image pull policy              | `Always`                               |
   | Container port (under "Networking → Port Forwarding") | `5000` |
   | Node port                      | something free, e.g. `30500`           |
   | Host Path Volume → mount path  | `/data`                                |
   | Host Path Volume → host path   | `/mnt/tank/apps/taggich`               |
   | Run As → User / Group          | `1000` / `1000`                        |

   Leave the env-var section empty — you'll set up the connection in the UI.

3. **Save → Install.** Once the app is healthy, open
   `http://<truenas-ip>:30500` (or whatever port you chose). You'll land on the
   Setup screen:

   - **Immich URL** — `http://<your-immich-host>:2283` (or whatever the Immich
     web UI lives at).
   - **API key** — generate one in Immich → account settings → API Keys.

   Hit **Test**, then **Save & continue**. The credentials are written to
   `/data/config.json` (which is the host path you mounted), so they survive
   restarts and upgrades.

4. **Done.** Click an album to start tagging.

To update later: TrueNAS apps page → upgrade the image, or just pull a new tag.

---

## Run it with plain Docker Compose

```sh
git clone https://github.com/TalunJames/Taggich.git
cd Taggich

# Optional — pre-seed credentials. Skip this and use the in-app Setup instead.
cp .env.example .env
$EDITOR .env

docker compose up -d
```

Then open <http://localhost:5000>. The first run shows the Setup screen unless
you set `IMMICH_URL` + `IMMICH_API_KEY` in `.env`.

By default the compose file pulls `ghcr.io/talunjames/taggich:latest`. To build
locally instead, comment out the `image:` line and uncomment `build: .` in
[`docker-compose.yml`](docker-compose.yml).

---

## Run it without Docker

```sh
pip install -r requirements.txt
python app.py            # then open http://localhost:5000
```

`app.py` uses [waitress](https://github.com/Pylons/waitress) for the
production WSGI server when available, falling back to Flask's dev server.

---

## Project layout

```
app.py                          Flask backend (wraps the Immich REST API)
requirements.txt                flask + requests + waitress
Dockerfile                      Non-root, slim, multi-arch
docker-compose.yml              For local + TrueNAS Scale deployment
.env.example                    Optional env-var overrides
.github/workflows/
  docker-publish.yml            Builds & pushes to ghcr.io on push to main
templates/
  index.html                    Mounts the React app
static/
  styles.css                    Design tokens + components
  icons.jsx                     Single SVG icon set
  placeholders.jsx              Striped SVG cover fallback
  api.jsx                       Live store + fetch helpers (replaces mock data)
  thumb.jsx                     <Thumb assetId> for real Immich thumbnails
  tweaks-panel.jsx              Floating Tweaks panel
  app.jsx                       App root + top nav
  components/
    Sidebar.jsx                 Album list (Tagger left pane)
    MediaViewer.jsx             Stage + filmstrip + video controls
    TagPanel.jsx                Applied / recent / suggested / all
    CommandPalette.jsx          ⌘K search-apply-create
  screens/
    Setup.jsx                   First-run connection screen
    Home.jsx                    Album library
    Tagger.jsx                  Three-pane tagging workspace
    TagManager.jsx              Rename / color / delete / merge tags
```

---

## API surface

The full set of routes exposed by `app.py`:

| Method | Path                                | Purpose                                   |
| ------ | ----------------------------------- | ----------------------------------------- |
| GET    | `/`                                 | Serve the React UI                        |
| GET    | `/healthz`                          | Liveness probe (no Immich call)           |
| GET    | `/api/config/status`                | Has the user finished Setup?              |
| POST   | `/api/config/test`                  | Test URL+key without saving               |
| POST   | `/api/config`                       | Save URL+key to `/data/config.json`       |
| DELETE | `/api/config`                       | Wipe stored credentials                   |
| GET    | `/api/library`                      | Bootstrap — albums + tags                 |
| GET    | `/api/albums`                       | List albums                               |
| GET    | `/api/albums/<id>`                  | Album detail incl. assets                 |
| GET    | `/api/albums/<id>/assets`           | Just the album's assets                   |
| POST   | `/api/albums/<id>/rename`           | Rename album                              |
| GET    | `/api/assets/<id>`                  | Asset detail (incl. tags)                 |
| GET    | `/api/assets/<id>/thumbnail?size=…` | JPEG thumbnail                            |
| GET    | `/api/assets/<id>/stream`           | Original asset w/ HTTP Range support      |
| POST   | `/api/delete-asset`                 | Delete asset                              |
| GET    | `/api/tags`                         | All tags                                  |
| POST   | `/api/tags`                         | Create tag                                |
| PUT    | `/api/tags/<id>`                    | Rename / set color                        |
| DELETE | `/api/tags/<id>`                    | Delete tag                                |
| POST   | `/api/tags/<id>/merge`              | Reassign assets, then delete src tag      |
| GET    | `/api/tags/<id>/assets`             | Assets that have this tag                 |
| POST   | `/api/tag-asset`                    | Apply tag by name (creates if missing)    |
| POST   | `/api/untag-asset`                  | Remove tag                                |

All `/api/*` routes (except `/api/config/*`) return `503 NOT_CONFIGURED` until
you finish Setup.

---

## Keyboard

- **⌘K / Ctrl+K** — command palette
- **← / →**       — prev / next asset (Tagger)
- **F**           — toggle focus mode

---

## Known limitations

- "Suggested" tags use library-wide frequency rather than ML similarity.
- Tag aliases shown in the design are not surfaced — Immich tags have no
  alias field.
- A/B markers and frame-step buttons in the video control bar are cosmetic;
  play/scrub/volume/speed/loop/fullscreen are all wired up.
- Per-tag counts in the Tag Manager are computed from the albums you've
  visited so far. They grow as you browse.

---

## License

MIT. See [LICENSE](LICENSE).

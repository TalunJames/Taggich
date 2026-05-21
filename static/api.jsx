// api.jsx — real-data store. Replaces the mock data.jsx from the Design.
//
// Exposes a global `useStore()` hook that returns:
//   { state, actions, helpers }
//
// state shape:
//   {
//     loaded:        bool,
//     loadError:     string | null,
//     albums:        Album[],
//     tags:          Tag[],
//     albumAssets:   { [albumId]: Asset[] },
//     loadingAlbum:  string | null,
//     toast:         string | null,
//   }
//
// Album/Asset/Tag are normalized into the shapes used by the design:
//   Album: { id, name, count, tagged, durationDays, cover, coverAssetId, updated, recentTags }
//   Asset: { id, kind: 'photo'|'video', name, taken, tags: [tagId], duration, raw }
//   Tag:   { id, name, color, count }
//
// Components still call window.tagById / window.albumById exactly like before.

const TAG_PALETTE = {
  amber: '#ffb547', orange: '#ff7a59', rose: '#ff6b8a',
  violet: '#a78bfa', indigo: '#7c7cff', sky: '#5ab9ff',
  teal: '#3fc7c1', green: '#3ddc97', lime: '#b7d34a',
  slate: '#94a3b8', red: '#ff5d5d', gold: '#d4a857',
};
const PALETTE_HEX = Object.values(TAG_PALETTE);
const PALETTE_NAMES = Object.keys(TAG_PALETTE);

function hashId(s) {
  s = s == null ? '' : String(s);
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

function autoColorHex(seed) {
  return PALETTE_HEX[hashId(seed) % PALETTE_HEX.length];
}

function nearestPaletteName(hex) {
  if (!hex) return null;
  hex = hex.toLowerCase();
  const direct = Object.entries(TAG_PALETTE).find(([, v]) => v.toLowerCase() === hex);
  if (direct) return direct[0];
  // Otherwise pick by simple RGB distance.
  const parse = (h) => {
    const m = /^#?([0-9a-f]{6})$/i.exec(h);
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  };
  const a = parse(hex);
  if (!a) return null;
  let best = null, bestD = Infinity;
  for (const [name, h] of Object.entries(TAG_PALETTE)) {
    const b = parse(h);
    if (!b) continue;
    const d = (a[0]-b[0])**2 + (a[1]-b[1])**2 + (a[2]-b[2])**2;
    if (d < bestD) { bestD = d; best = name; }
  }
  return best;
}

// ─── Normalizers ────────────────────────────────────────────────────────────

function normalizeTag(t) {
  const colorHex = t.color || autoColorHex(t.id || t.name);
  return {
    id: t.id,
    name: t.name,
    color: colorHex,                 // always a hex string for display
    colorName: nearestPaletteName(colorHex),
    raw: t,
    count: 0,                        // populated as we load albums/assets
  };
}

function normalizeAsset(a) {
  const tagIds = (a.tags || []).map(t => t.id).filter(Boolean);
  const isVideo = (a.type || '').toUpperCase() === 'VIDEO';
  const dur = isVideo ? (() => {
    // exifInfo.duration is "HH:MM:SS.mmm" or seconds. The asset itself often
    // has `duration: "00:00:32.0000000"`.
    const s = a.duration || a.exifInfo?.duration;
    if (!s) return 0;
    if (typeof s === 'number') return s;
    const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(s);
    if (!m) return 0;
    return Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
  })() : undefined;
  return {
    id: a.id,
    kind: isVideo ? 'video' : 'photo',
    name: a.originalFileName || a.fileName || a.id,
    taken: (a.fileCreatedAt || a.createdAt || '').replace('T', ' ').slice(0, 16),
    tags: tagIds,
    duration: dur,
    raw: a,
  };
}

function normalizeAlbum(a, cachedStats) {
  const norm = {
    id: a.id,
    name: a.albumName || a.name || 'Untitled album',
    count: a.assetCount ?? (Array.isArray(a.assets) ? a.assets.length : 0),
    tagged: null,                       // null = "not loaded yet" (vs 0 = "loaded and none")
    durationDays: 0,                    // ditto
    cover: a.id,                        // placeholder seed if no asset
    coverAssetId: a.albumThumbnailAssetId || null,
    updated: a.updatedAt || a.createdAt || '',
    recentTags: [],                     // computed from assets
    statsLoaded: false,                 // flipped to true once we've fetched assets
    raw: a,
  };
  // Apply any saved stats from a previous session, but only if the album
  // hasn't been updated since the cache snapshot (i.e. Immich's updatedAt
  // is the same or older).
  const c = cachedStats && cachedStats[a.id];
  if (c && (!norm.updated || (c.albumUpdated && c.albumUpdated >= norm.updated))) {
    norm.tagged = c.tagged ?? norm.tagged;
    norm.durationDays = c.durationDays ?? norm.durationDays;
    norm.recentTags = c.recentTags || [];
    norm.coverAssetId = norm.coverAssetId || c.coverAssetId || null;
    norm.statsLoaded = true;
  }
  return norm;
}

// ─── Persistent stats cache (localStorage) ─────────────────────────────────
const STATS_LS_KEY = 'taggich:album-stats:v1';
const STATS_LS_MAX_AGE_MS = 30 * 60 * 1000;   // 30 minutes

function loadPersistedStats() {
  try {
    const raw = localStorage.getItem(STATS_LS_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw);
    if (!data || typeof data !== 'object') return null;
    if (Date.now() - (data.ts || 0) > STATS_LS_MAX_AGE_MS) return null;
    return data;
  } catch (e) {
    return null;
  }
}

function persistStats() {
  try {
    const stats = {};
    for (const a of _state.albums) {
      if (!a.statsLoaded) continue;
      stats[a.id] = {
        tagged: a.tagged,
        durationDays: a.durationDays,
        recentTags: a.recentTags || [],
        coverAssetId: a.coverAssetId || null,
        albumUpdated: a.updated,
      };
    }
    localStorage.setItem(STATS_LS_KEY, JSON.stringify({
      ts: Date.now(),
      stats,
    }));
  } catch (e) {
    // localStorage quota / private mode — non-fatal
  }
}

// ─── Fetch helpers ──────────────────────────────────────────────────────────

async function jsonOrThrow(resp) {
  let body = null;
  try { body = await resp.json(); } catch (_) {}
  if (!resp.ok) {
    const msg = (body && (body.error || body.message)) || resp.statusText || 'Request failed';
    throw new Error(msg);
  }
  return body;
}

const api = {
  bootstrap:     ()                 => fetch('/api/library').then(jsonOrThrow),
  albumAssets:   (id)               => fetch(`/api/albums/${id}/assets`).then(jsonOrThrow),
  asset:         (id)               => fetch(`/api/assets/${id}`).then(jsonOrThrow),
  renameAlbum:   (id, name)         => fetch(`/api/albums/${id}/rename`, post({new_name: name})),
  tagByName:     (assetId, name, color) => fetch('/api/tag-asset', post({asset_id: assetId, tag_name: name, color})),
  untag:         (assetId, tagId)   => fetch('/api/untag-asset', post({asset_id: assetId, tag_id: tagId})),
  createTag:     (name, color)      => fetch('/api/tags', post({name, color})),
  updateTag:     (id, patch)        => fetch(`/api/tags/${id}`, {method: 'PUT', headers: jsonH(), body: JSON.stringify(patch)}),
  deleteTag:     (id)               => fetch(`/api/tags/${id}`, {method: 'DELETE'}),
  mergeTag:      (srcId, intoId)    => fetch(`/api/tags/${srcId}/merge`, post({into: intoId})),
  deleteAsset:   (id)               => fetch('/api/delete-asset', post({asset_id: id})),
};
function jsonH() { return {'Content-Type': 'application/json'}; }
function post(body) { return {method: 'POST', headers: jsonH(), body: JSON.stringify(body)}; }
// Tack on .then(jsonOrThrow) for the helpers that need it.
['renameAlbum','tagByName','untag','createTag','updateTag','deleteTag','mergeTag','deleteAsset']
  .forEach(k => { const f = api[k]; api[k] = (...args) => f(...args).then(jsonOrThrow); });

window.tagApi = api;

// ─── Store (React context + listeners) ──────────────────────────────────────

const _state = {
  loaded: false,
  loadError: null,
  albums: [],
  tags: [],
  albumAssets: {},
  loadingAlbum: null,
  statsScanning: false,
  toast: null,
};
const _listeners = new Set();
const _byId = (arr, k = 'id') => Object.fromEntries(arr.map(x => [x[k], x]));

function snapshot() { return _state; }
function set(patch) {
  Object.assign(_state, patch);
  // keep window globals in sync so existing components keep working
  window.TAGS = _state.tags;
  window.ALBUMS = _state.albums;
  window.TAG_COLORS = TAG_PALETTE;
  for (const l of _listeners) l();
}
function subscribe(cb) { _listeners.add(cb); return () => _listeners.delete(cb); }

window.tagById   = (id) => _state.tags.find(t => t.id === id) || null;
window.albumById = (id) => _state.albums.find(a => a.id === id) || null;
window.TAG_COLORS = TAG_PALETTE;
window.TAGS = [];
window.ALBUMS = [];
window.ASSETS = [];
window.RECENT_TAG_IDS = [];
window.SUGGESTED_TAG_IDS = [];

// ─── Recompute helpers ──────────────────────────────────────────────────────

function recomputeTagCounts() {
  const counts = {};
  for (const list of Object.values(_state.albumAssets)) {
    for (const a of list) for (const tid of a.tags) counts[tid] = (counts[tid] || 0) + 1;
  }
  const tags = _state.tags.map(t => ({...t, count: counts[t.id] || t.count || 0}));
  return tags;
}

function recomputeAlbumDerived(albumId) {
  const album = _state.albums.find(a => a.id === albumId);
  const list = _state.albumAssets[albumId];
  if (!album || !list) return null;
  const tagged = list.reduce((s, a) => s + (a.tags.length > 0 ? 1 : 0), 0);
  // duration span
  const times = list.map(a => a.raw?.fileCreatedAt || a.raw?.createdAt).filter(Boolean).map(s => +new Date(s));
  let durationDays = 0;
  if (times.length >= 2) {
    durationDays = Math.max(1, Math.round((Math.max(...times) - Math.min(...times)) / 86400000));
  }
  // top tags by frequency
  const counts = {};
  for (const a of list) for (const tid of a.tags) counts[tid] = (counts[tid] || 0) + 1;
  const recentTags = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 6).map(x => x[0]);
  // cover: prefer the album's existing thumbnail asset, otherwise first asset
  const coverAssetId = album.coverAssetId || (list[0] && list[0].id) || null;
  return {...album, tagged, durationDays, recentTags, coverAssetId, statsLoaded: true, count: album.count || list.length};
}

// Background stat loader — throttled fetch of every album so the Home page
// shows accurate "X% tagged" rather than 0% on first render.
let _statsLoading = false;
async function loadAllAlbumStats({concurrency = 3, force = false} = {}) {
  if (_statsLoading) return;
  _statsLoading = true;
  set({statsScanning: true});
  try {
    const queue = _state.albums
      .filter(a => force || !a.statsLoaded)
      .map(a => a.id);
    console.info(`[taggich] background stats: ${queue.length} albums queued${force ? ' (force refresh)' : ''}`);
    let active = 0;
    let i = 0;
    let failed = 0;
    await new Promise(resolve => {
      const tick = () => {
        if (i >= queue.length && active === 0) return resolve();
        while (active < concurrency && i < queue.length) {
          const id = queue[i++];
          active++;
          loadAlbumAssets(id, {force})
            .catch(e => { failed++; console.warn('[taggich] album load failed', id, e); })
            .finally(() => { active--; tick(); });
        }
      };
      tick();
    });
    console.info(`[taggich] background stats done. ${failed} failed of ${queue.length}.`);
    persistStats();
  } finally {
    _statsLoading = false;
    set({statsScanning: false});
  }
}

// ─── Public actions ─────────────────────────────────────────────────────────

async function bootstrap() {
  if (_state.loaded) return;
  // Restore previous-session tag counts so the Home grid paints with
  // real percentages immediately rather than "scanning…" for everything.
  const persisted = loadPersistedStats();
  try {
    const data = await api.bootstrap();
    const albums = (data.albums || [])
      .map(a => normalizeAlbum(a, persisted && persisted.stats))
      .sort((a, b) => (b.updated || '').localeCompare(a.updated || ''));
    const tags = (data.tags || []).map(normalizeTag).sort((a, b) => a.name.localeCompare(b.name));
    set({loaded: true, albums, tags, loadError: null});
    if (persisted) {
      const restored = albums.filter(a => a.statsLoaded).length;
      if (restored) console.info(`[taggich] restored stats for ${restored}/${albums.length} albums from cache`);
    }
  } catch (e) {
    set({loaded: true, loadError: e.message || String(e)});
  }
}

async function loadAlbumAssets(albumId, {force = false} = {}) {
  if (!albumId) return;
  if (!force && _state.albumAssets[albumId]) return _state.albumAssets[albumId];
  set({loadingAlbum: albumId});
  try {
    const raw = await api.albumAssets(albumId);
    const list = raw.map(normalizeAsset).sort((a, b) => (a.taken || '').localeCompare(b.taken || ''));
    const nextMap = {..._state.albumAssets, [albumId]: list};
    _state.albumAssets = nextMap;
    // bump tag counts + album-derived stats
    const tags = recomputeTagCounts();
    const updated = recomputeAlbumDerived(albumId);
    const albums = _state.albums.map(a => a.id === albumId ? updated : a);
    set({albumAssets: nextMap, tags, albums, loadingAlbum: null});
    return list;
  } catch (e) {
    set({loadingAlbum: null, toast: 'Failed to load album: ' + e.message});
    return [];
  }
}

async function refreshAssetTags(albumId, assetId) {
  try {
    const fresh = await api.asset(assetId);
    const norm = normalizeAsset(fresh);
    const list = (_state.albumAssets[albumId] || []).map(a => a.id === assetId ? norm : a);
    _state.albumAssets[albumId] = list;
    const tags = recomputeTagCounts();
    const updated = recomputeAlbumDerived(albumId);
    const albums = updated ? _state.albums.map(a => a.id === albumId ? updated : a) : _state.albums;
    set({albumAssets: _state.albumAssets, tags, albums});
    persistStats();
    return norm;
  } catch (e) {
    set({toast: 'Failed to refresh asset: ' + e.message});
  }
}

async function applyTagByName(albumId, assetId, name) {
  const trimmed = (name || '').trim();
  if (!trimmed) return;
  const existing = _state.tags.find(t => t.name.toLowerCase() === trimmed.toLowerCase());
  try {
    const color = existing ? existing.color : autoColorHex(trimmed);
    const resp = await api.tagByName(assetId, trimmed, color);
    // Server returns the tag (created or matched). Merge into store.
    if (resp && resp.tag) {
      const tag = normalizeTag(resp.tag);
      const tags = _state.tags.some(t => t.id === tag.id)
        ? _state.tags.map(t => t.id === tag.id ? {...t, ...tag, count: t.count} : t)
        : [..._state.tags, tag].sort((a, b) => a.name.localeCompare(b.name));
      _state.tags = tags;
    }
    await refreshAssetTags(albumId, assetId);
  } catch (e) {
    set({toast: 'Tag failed: ' + e.message});
  }
}

async function toggleTagById(albumId, assetId, tagId) {
  const list = _state.albumAssets[albumId] || [];
  const asset = list.find(a => a.id === assetId);
  if (!asset) return;
  try {
    if (asset.tags.includes(tagId)) {
      await api.untag(assetId, tagId);
    } else {
      const tag = window.tagById(tagId);
      if (!tag) return;
      await api.tagByName(assetId, tag.name, tag.color);
    }
    await refreshAssetTags(albumId, assetId);
  } catch (e) {
    set({toast: 'Tag update failed: ' + e.message});
  }
}

async function createTag(name, color) {
  const hex = color || autoColorHex(name);
  const t = await api.createTag(name.trim(), hex);
  const tag = normalizeTag(t);
  const tags = [..._state.tags, tag].sort((a, b) => a.name.localeCompare(b.name));
  set({tags});
  return tag;
}

async function renameTag(id, name) {
  const t = await api.updateTag(id, {name});
  const next = normalizeTag(t);
  const tags = _state.tags.map(x => x.id === id ? {...x, ...next, count: x.count} : x);
  set({tags});
}

async function setTagColor(id, colorHex) {
  const t = await api.updateTag(id, {color: colorHex});
  const next = normalizeTag(t);
  const tags = _state.tags.map(x => x.id === id ? {...x, ...next, count: x.count} : x);
  set({tags});
}

async function deleteTag(id) {
  await api.deleteTag(id);
  const tags = _state.tags.filter(t => t.id !== id);
  // strip the tag from any cached assets too
  const albumAssets = {};
  for (const [k, list] of Object.entries(_state.albumAssets)) {
    albumAssets[k] = list.map(a => a.tags.includes(id) ? {...a, tags: a.tags.filter(t => t !== id)} : a);
  }
  set({tags, albumAssets});
}

async function mergeTags(srcId, intoId) {
  await api.mergeTag(srcId, intoId);
  const tags = _state.tags.filter(t => t.id !== srcId);
  const albumAssets = {};
  for (const [k, list] of Object.entries(_state.albumAssets)) {
    albumAssets[k] = list.map(a => {
      if (!a.tags.includes(srcId)) return a;
      const newTags = a.tags.filter(t => t !== srcId);
      if (!newTags.includes(intoId)) newTags.push(intoId);
      return {...a, tags: newTags};
    });
  }
  set({tags, albumAssets});
}

async function deleteAsset(albumId, assetId) {
  await api.deleteAsset(assetId);
  const list = (_state.albumAssets[albumId] || []).filter(a => a.id !== assetId);
  const nextMap = {..._state.albumAssets, [albumId]: list};
  _state.albumAssets = nextMap;
  const tags = recomputeTagCounts();
  const updated = recomputeAlbumDerived(albumId);
  const albums = updated ? _state.albums.map(a => a.id === albumId ? updated : a) : _state.albums;
  set({albumAssets: nextMap, tags, albums});
}

async function renameAlbumAction(id, name) {
  await api.renameAlbum(id, name);
  const albums = _state.albums.map(a => a.id === id ? {...a, name} : a);
  set({albums});
}

function clearToast() { set({toast: null}); }

// ─── React hook ─────────────────────────────────────────────────────────────

function useStore() {
  const [, setV] = React.useState(0);
  React.useEffect(() => subscribe(() => setV(v => v + 1)), []);
  return {
    state: snapshot(),
    actions: {
      bootstrap, loadAlbumAssets, loadAllAlbumStats, refreshAssetTags,
      applyTagByName, toggleTagById,
      createTag, renameTag, setTagColor, deleteTag, mergeTags,
      deleteAsset, renameAlbum: renameAlbumAction,
      clearToast,
    },
    helpers: { autoColorHex, hashId, TAG_PALETTE, PALETTE_HEX, PALETTE_NAMES },
  };
}

window.useStore = useStore;
window.TAG_COLORS = TAG_PALETTE;

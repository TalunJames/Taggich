// Tagger — 3-pane workspace driven by the live store.

function Tagger({ albumId, onPickAlbum, onOpenTagMgr }) {
  const { state, actions } = useStore();
  const [assetIdx, setAssetIdx] = React.useState(0);
  const [focus, setFocus] = React.useState(false);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  const album = state.albums.find(a => a.id === albumId);
  const assets = state.albumAssets[albumId] || [];

  // Load the album's assets on mount / album change.
  React.useEffect(() => {
    if (albumId) actions.loadAlbumAssets(albumId);
    setAssetIdx(0);
  }, [albumId]);

  // Clamp index when asset list changes (e.g. after delete).
  React.useEffect(() => {
    if (assetIdx >= assets.length && assets.length > 0) setAssetIdx(0);
  }, [assets.length]);

  const asset = assets[assetIdx] || null;

  // When an asset becomes current, refresh its detail in the background so
  // we always have the latest tag list even if the album response was light.
  const refreshedRef = React.useRef(new Set());
  React.useEffect(() => {
    if (!asset || !albumId) return;
    if (refreshedRef.current.has(asset.id)) return;
    refreshedRef.current.add(asset.id);
    actions.refreshAssetTags(albumId, asset.id);
  }, [asset && asset.id, albumId]);

  const next = React.useCallback(() => {
    if (assets.length === 0) return;
    setAssetIdx(i => (i + 1) % assets.length);
  }, [assets.length]);
  const prev = React.useCallback(() => {
    if (assets.length === 0) return;
    setAssetIdx(i => (i - 1 + assets.length) % assets.length);
  }, [assets.length]);

  const toggleTag = React.useCallback((tagId) => {
    if (!asset) return;
    actions.toggleTagById(albumId, asset.id, tagId);
  }, [albumId, asset && asset.id]);

  const createAndApply = React.useCallback(async (name) => {
    if (!asset) return;
    await actions.applyTagByName(albumId, asset.id, name);
  }, [albumId, asset && asset.id]);

  const deleteCurrent = React.useCallback(async () => {
    if (!asset) return;
    if (!confirm(`Delete "${asset.name}"? This removes it from Immich.`)) return;
    await actions.deleteAsset(albumId, asset.id);
  }, [albumId, asset && asset.id]);

  React.useEffect(() => {
    const onKey = (e) => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }
      if (paletteOpen) return;
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
      if (e.key === 'f' || e.key === 'F') setFocus(f => !f);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [next, prev, paletteOpen]);

  if (!album) {
    return (
      <div className="workspace">
        <Sidebar currentAlbumId={albumId} onPickAlbum={onPickAlbum} collapsed={false} onExpand={() => {}} />
        <section className="pane center"><div style={{padding: 24, color: 'var(--ink-4)'}}>Pick an album from the sidebar.</div></section>
      </div>
    );
  }

  if (!asset) {
    return (
      <div className="workspace">
        <Sidebar currentAlbumId={albumId} onPickAlbum={onPickAlbum} collapsed={false} onExpand={() => {}} />
        <section className="pane center">
          <div className="pane-hd" style={{padding: '0 16px'}}>
            <span className="title" style={{fontSize: 13}}>{album.name}</span>
          </div>
          <div style={{flex: 1, display: 'grid', placeItems: 'center', color: 'var(--ink-4)'}}>
            {state.loadingAlbum === albumId ? 'Loading assets…' : 'No assets in this album.'}
          </div>
        </section>
      </div>
    );
  }

  return (
    <div className={'workspace ' + (focus ? 'focus' : '')}>
      <Sidebar
        currentAlbumId={albumId}
        onPickAlbum={onPickAlbum}
        collapsed={focus}
        onExpand={() => setFocus(false)} />

      <section className="pane center">
        {!focus && (
          <div className="pane-hd" style={{padding: '0 16px'}}>
            <span className="title" style={{fontSize: 13}}>{album.name}</span>
            <span className="sub mono">·</span>
            <span className="sub mono">{assetIdx + 1}/{assets.length}</span>
            <span className="sub" style={{marginLeft: 6}}>{asset.name}</span>
            <div style={{flex: 1}}></div>
            <button className="btn sm ghost" onClick={() => window.open(`/api/assets/${asset.id}/stream`, '_blank')}>
              <Icon name="download" size={12} />
            </button>
            <button className="btn sm ghost" onClick={deleteCurrent}>
              <Icon name="trash" size={12} />
            </button>
          </div>
        )}
        <div style={{flex: 1, minHeight: 0, display: 'grid'}}>
          <MediaViewer
            asset={asset}
            assets={assets}
            onNext={next}
            onPrev={prev}
            onToggleFocus={() => setFocus(f => !f)}
            onDelete={deleteCurrent}
            focus={focus} />
        </div>
      </section>

      {focus ? (
        <aside className="pane right collapsed">
          <div className="pane-hd">
            <button className="iconbtn"
                    style={{width: 32, height: 32, borderRadius: 8, color: 'var(--ink-3)', display: 'grid', placeItems: 'center'}}
                    title="Expand tag panel"
                    onClick={() => setFocus(false)}>
              <Icon name="tag" />
            </button>
          </div>
          <div className="rail" style={{flex: 1, minHeight: 0}}>
            {asset.tags.slice(0, 8).map(tid => {
              const t = window.tagById(tid);
              if (!t) return null;
              return (
                <span key={tid} className="rail-btn" title={t.name} style={{cursor: 'default'}}>
                  <span style={{width: 12, height: 12, borderRadius: 50, background: t.color, display: 'block'}}></span>
                </span>
              );
            })}
            <button className="rail-btn" title="Add tag (⌘K)" onClick={() => setPaletteOpen(true)}>
              <Icon name="plus" />
            </button>
          </div>
        </aside>
      ) : (
        <TagPanel
          asset={asset}
          allAssets={assets}
          onToggleTag={toggleTag}
          onOpenPalette={() => setPaletteOpen(true)}
          onOpenTagMgr={onOpenTagMgr}
          onDelete={deleteCurrent} />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        assetTags={asset.tags}
        onToggleTag={toggleTag}
        onCreateAndApply={createAndApply}
        assetName={asset.name} />
    </div>
  );
}

window.Tagger = Tagger;

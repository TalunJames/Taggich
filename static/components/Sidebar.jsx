// Sidebar — real album list for the Tagger screen.

function Sidebar({ currentAlbumId, onPickAlbum, collapsed, onExpand }) {
  const { state } = useStore();
  const [q, setQ] = React.useState('');
  const albums = state.albums || [];

  if (collapsed) {
    return (
      <aside className="pane left collapsed">
        <div className="pane-hd">
          <button className="iconbtn" title="Expand album list" onClick={onExpand}
                  style={{width: 32, height: 32, borderRadius: 8, color: 'var(--ink-3)', display: 'grid', placeItems: 'center'}}>
            <Icon name="album" />
          </button>
        </div>
        <div className="rail scroll" style={{flex: 1, minHeight: 0}}>
          {albums.slice(0, 12).map(a => (
            <button key={a.id}
                    className="rail-btn"
                    aria-current={a.id === currentAlbumId}
                    title={a.name}
                    onClick={() => onPickAlbum(a.id)}>
              <span style={{width: 26, height: 26, borderRadius: 6, overflow: 'hidden', display: 'block', position: 'relative'}}>
                <Thumb assetId={a.coverAssetId} seed={a.id} />
              </span>
            </button>
          ))}
        </div>
      </aside>
    );
  }
  const filtered = albums.filter(a => a.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <aside className="pane left">
      <div className="pane-hd">
        <span className="title">Albums</span>
        <span className="sub mono">{albums.length}</span>
        <div style={{flex: 1}}></div>
        <button className="iconbtn" title="Refresh albums"
                onClick={() => window.location.reload()}
                style={{width: 26, height: 26, borderRadius: 6, color: 'var(--ink-3)', display: 'grid', placeItems: 'center'}}>
          <Icon name="refresh" />
        </button>
      </div>
      <div className="sidebar-search">
        <div className="search">
          <span className="ico"><Icon name="search" /></span>
          <input className="input" placeholder="Filter albums" value={q} onChange={e => setQ(e.target.value)} />
        </div>
      </div>
      <div className="pane-body scroll">
        <div className="sidebar-section section-lbl">
          <span>Recently updated</span>
        </div>
        <div className="album-list">
          {filtered.map(a => {
            const pct = a.count ? Math.round((a.tagged || 0) / a.count * 100) : 0;
            return (
              <div key={a.id} className="album" aria-current={a.id === currentAlbumId}
                   onClick={() => onPickAlbum(a.id)}>
                <span className="thumb" style={{position: 'relative'}}>
                  <Thumb assetId={a.coverAssetId} seed={a.id} />
                </span>
                <span className="meta">
                  <span className="name">{a.name}</span>
                  <span className="sub">
                    <span className="mono">{a.count.toLocaleString()}</span>
                    <span>·</span>
                    <span>{pct}% tagged</span>
                  </span>
                </span>
                <span className="cnt">{a.count > 999 ? (a.count/1000).toFixed(1) + 'k' : a.count}</span>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{padding: '12px 16px', color: 'var(--ink-4)', fontSize: 12}}>No matches.</div>
          )}
        </div>
      </div>
    </aside>
  );
}

window.Sidebar = Sidebar;

// Home — real albums grid + library overview.

function Home({ onOpenAlbum }) {
  const { state } = useStore();
  const [view, setView] = React.useState('grid');
  const [sort, setSort] = React.useState('updated');
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');

  const albums = state.albums || [];
  const tags = state.tags || [];

  const filtered = albums
    .filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()))
    .filter(a => filter === 'untagged' ? (a.tagged ?? 0) < a.count : true)
    .sort((a, b) => {
      if (sort === 'updated') return (b.updated || '').localeCompare(a.updated || '');
      if (sort === 'name') return a.name.localeCompare(b.name);
      if (sort === 'size') return b.count - a.count;
      return 0;
    });

  const totalAssets = albums.reduce((s, a) => s + (a.count || 0), 0);
  const taggedAssets = albums.reduce((s, a) => s + (a.tagged || 0), 0);
  const untagged = Math.max(0, totalAssets - taggedAssets);
  const pct = totalAssets ? Math.round((taggedAssets / totalAssets) * 100) : 0;

  return (
    <main className="home">
      <header className="home-hd">
        <div>
          <h1>Library</h1>
          <div style={{color: 'var(--ink-3)', fontSize: 13, marginTop: 6}}>
            Pick an album to start tagging. <span className="dim">Connected to</span>{' '}
            <span className="mono" style={{color: 'var(--ink-2)'}}>{window.IMMICH_URL || 'immich'}</span>
          </div>
        </div>
        <div className="stats">
          <div><span className="v">{albums.length}</span><span className="dim" style={{marginLeft: 4, fontSize: 11}}>albums</span></div>
          <div><span className="v">{totalAssets.toLocaleString()}</span><span className="dim" style={{marginLeft: 4, fontSize: 11}}>assets</span></div>
          <div><span className="v">{untagged.toLocaleString()}</span><span className="dim" style={{marginLeft: 4, fontSize: 11}}>untagged</span></div>
          <div><span className="v">{pct}%<span className="u"></span></span><span className="dim" style={{marginLeft: 4, fontSize: 11}}>tagged</span></div>
        </div>
      </header>

      <div style={{display: 'grid', gridTemplateRows: 'auto 1fr', minHeight: 0}}>
        <div className="home-controls">
          <div className="search" style={{width: 280}}>
            <span className="ico"><Icon name="search" /></span>
            <input className="input" placeholder="Search albums" value={q} onChange={e => setQ(e.target.value)} />
            <span className="kbd">/</span>
          </div>
          <div style={{flex: 1}}></div>
          <div className="seg" role="tablist">
            {[{k: 'all', label: 'All'}, {k: 'untagged', label: 'Has untagged'}].map(o => (
              <button key={o.k} aria-current={filter === o.k} onClick={() => setFilter(o.k)}>{o.label}</button>
            ))}
          </div>
          <button className="btn ghost" onClick={() => setSort(s => s === 'updated' ? 'name' : s === 'name' ? 'size' : 'updated')}>
            <Icon name="chevD" size={13} /> Sort: {sort}
          </button>
          <div className="seg" role="tablist">
            <button aria-current={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" size={13} /></button>
            <button aria-current={view === 'rows'} onClick={() => setView('rows')}><Icon name="rows" size={13} /></button>
          </div>
          <button className="btn" onClick={() => window.location.reload()}>
            <Icon name="refresh" size={13} /> Refresh
          </button>
        </div>

        <div className="home-grid scroll">
          {state.loadError && (
            <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>
              Couldn't load albums: {state.loadError}
            </div>
          )}
          {!state.loaded && (
            <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>Loading…</div>
          )}
          {state.loaded && filtered.length === 0 && !state.loadError && (
            <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>No albums match.</div>
          )}
          {filtered.map(a => (
            <AlbumCard key={a.id} album={a} tags={tags} onOpen={() => onOpenAlbum(a.id)} />
          ))}
        </div>
      </div>
    </main>
  );
}

function AlbumCard({ album, tags, onOpen }) {
  const taggedPct = album.count ? Math.round((album.tagged || 0) / album.count * 100) : 0;
  const dateStr = album.updated
    ? new Date(album.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  return (
    <article className="albumcard" onClick={onOpen}>
      <div className="cover" style={{position: 'relative'}}>
        <Thumb assetId={album.coverAssetId} seed={album.id} label={album.name} />
        <div className="badges">
          <span className="badge">
            <Icon name="picture" size={11} />
            {album.count.toLocaleString()}
          </span>
          {album.tagged < album.count && album.tagged > 0 && (
            <span className="badge" style={{background: 'rgba(255,122,89,.85)', color: '#1a0a04', border: 0}}>
              {(album.count - album.tagged).toLocaleString()} untagged
            </span>
          )}
        </div>
        <div className="progress"><div className="fill" style={{width: taggedPct + '%'}}></div></div>
      </div>
      <div className="body">
        <div className="row1">
          <span className="name">{album.name}</span>
          <span className="when">{dateStr}</span>
        </div>
        <div className="meta">
          <span>{album.durationDays || 0}d span</span>
          <span className="pip"></span>
          <span>{(album.tagged || 0).toLocaleString()} / {album.count.toLocaleString()} tagged</span>
        </div>
        {album.recentTags.length > 0 ? (
          <div className="tagrow">
            {album.recentTags.slice(0, 4).map(tid => {
              const t = tags.find(x => x.id === tid);
              if (!t) return null;
              return (
                <span key={tid} style={{display: 'inline-flex', alignItems: 'center', gap: 4}}>
                  <span className="dot" style={{background: t.color}}></span>
                  <span>{t.name}</span>
                </span>
              );
            })}
            {album.recentTags.length > 4 && <span className="dim">+{album.recentTags.length - 4}</span>}
          </div>
        ) : (
          <div className="tagrow"><span className="dim" style={{fontStyle: 'italic'}}>No tags yet — start here</span></div>
        )}
      </div>
    </article>
  );
}

window.Home = Home;

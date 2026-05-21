// Home — real albums grid + library overview.

function Home({ onOpenAlbum }) {
  const { state, actions } = useStore();
  const [view, setView] = React.useState('grid');
  const [sort, setSort] = React.useState('updated');
  const [filter, setFilter] = React.useState('all');
  const [q, setQ] = React.useState('');
  // Cross-album mode: 'albums' (default grid) vs 'longestVideos'.
  const [mode, setMode] = React.useState('albums');

  const albums = state.albums || [];
  const tags = state.tags || [];

  const filtered = sortAlbums(
    albums
      .filter(a => !q || a.name.toLowerCase().includes(q.toLowerCase()))
      .filter(a => filter === 'untagged' ? (a.statsLoaded && (a.tagged ?? 0) < a.count) : true),
    sort
  );

  // Only roll up stats from albums that have actually been measured, otherwise
  // the headline percentage shows 0% just because we haven't fetched yet.
  const measured = albums.filter(a => a.statsLoaded);
  const totalAssets = albums.reduce((s, a) => s + (a.count || 0), 0);
  const measuredCount = measured.reduce((s, a) => s + (a.count || 0), 0);
  const taggedAssets = measured.reduce((s, a) => s + (a.tagged || 0), 0);
  const untagged = Math.max(0, measuredCount - taggedAssets);
  const pct = measuredCount ? Math.round((taggedAssets / measuredCount) * 100) : null;
  const statsLoading = (state.statsScanning || measured.length < albums.length) && albums.length > 0;

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
          <div>
            <span className="v">{statsLoading && measured.length === 0 ? '—' : untagged.toLocaleString()}</span>
            <span className="dim" style={{marginLeft: 4, fontSize: 11}}>untagged</span>
          </div>
          <div>
            <span className="v">{pct === null ? '—' : pct + '%'}<span className="u"></span></span>
            <span className="dim" style={{marginLeft: 4, fontSize: 11}}>
              tagged{statsLoading ? ` · scanning ${measured.length}/${albums.length}` : ''}
            </span>
          </div>
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
          <SortMenu value={sort} onChange={setSort} />
          <div className="seg" role="tablist">
            <button aria-current={view === 'grid'} onClick={() => setView('grid')}><Icon name="grid" size={13} /></button>
            <button aria-current={view === 'rows'} onClick={() => setView('rows')}><Icon name="rows" size={13} /></button>
          </div>
          <button className="btn"
                  aria-current={mode === 'longestVideos'}
                  onClick={() => setMode(m => m === 'longestVideos' ? 'albums' : 'longestVideos')}
                  title="Show every video in the library, longest first">
            <Icon name="video" size={13} />
            {mode === 'longestVideos' ? 'Show albums' : 'Longest videos'}
          </button>
          <button className="btn" onClick={() => actions.loadAllAlbumStats({force: true})}
                  disabled={state.statsScanning}
                  title="Re-scan every album for tag counts">
            <Icon name="refresh" size={13} /> {state.statsScanning ? 'Scanning…' : 'Rescan'}
          </button>
        </div>

        {statsLoading && (
          <div style={{
            padding: '8px 36px',
            background: 'var(--bg-2)',
            borderBottom: '1px solid var(--border)',
            color: 'var(--ink-3)',
            fontSize: 12,
            display: 'flex', alignItems: 'center', gap: 10,
          }}>
            <span className="dot" style={{
              width: 8, height: 8, borderRadius: 50,
              background: 'var(--accent)',
              animation: 'pulse 1.4s ease-in-out infinite',
              display: 'inline-block',
            }}></span>
            Scanning albums for tag counts… {measured.length}/{albums.length} done
            <span style={{
              flex: 1, height: 3, background: 'var(--border)', borderRadius: 2, overflow: 'hidden',
              marginLeft: 12, maxWidth: 240,
            }}>
              <span style={{
                display: 'block', height: '100%', width: ((measured.length / Math.max(1, albums.length)) * 100) + '%',
                background: 'var(--accent)', transition: 'width 200ms',
              }}></span>
            </span>
          </div>
        )}

        {mode === 'longestVideos' ? (
          <LongestVideosList onOpen={onOpenAlbum} />
        ) : (
          <div className="home-grid scroll">
            {state.loadError && (
              <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>
                Couldn't load albums: {state.loadError}
              </div>
            )}
            {!state.loaded && (
              <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>Loading…</div>
            )}
            {state.loaded && albums.length === 0 && !state.loadError && (
              <div style={{gridColumn: '1 / -1', padding: 32, textAlign: 'center', color: 'var(--ink-3)'}}>
                <div style={{fontSize: 14, marginBottom: 6}}>No albums found in Immich.</div>
                <div style={{fontSize: 12, color: 'var(--ink-4)'}}>
                  Create one in Immich (Albums → Create Album) and refresh, or pick a different
                  API key with access to your albums.
                </div>
              </div>
            )}
            {state.loaded && albums.length > 0 && filtered.length === 0 && !state.loadError && (
              <div style={{gridColumn: '1 / -1', padding: 24, color: 'var(--ink-3)'}}>
                No albums match "{q}". <button className="btn sm ghost" onClick={() => setQ('')} style={{marginLeft: 8}}>Clear filter</button>
              </div>
            )}
            {filtered.map(a => (
              <AlbumCard key={a.id} album={a} tags={tags} onOpen={() => onOpenAlbum(a.id)} />
            ))}
          </div>
        )}
      </div>
    </main>
  );
}

function AlbumCard({ album, tags, onOpen }) {
  const measured = album.statsLoaded;
  const tagged = album.tagged ?? 0;
  const taggedPct = measured && album.count ? Math.round(tagged / album.count * 100) : 0;
  const dateStr = album.updated
    ? new Date(album.updated).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
    : '';
  return (
    <article className="albumcard" onClick={onOpen} style={{minHeight: 240}}>
      <div className="cover" style={{position: 'relative'}}>
        <Thumb assetId={album.coverAssetId} seed={album.id} label={album.name} />
        <div className="badges">
          <span className="badge">
            <Icon name="picture" size={11} />
            {(album.count ?? 0).toLocaleString()}
          </span>
          {measured && tagged < album.count && tagged > 0 && (
            <span className="badge" style={{background: 'rgba(255,122,89,.85)', color: '#1a0a04', border: 0}}>
              {(album.count - tagged).toLocaleString()} untagged
            </span>
          )}
          {measured && tagged === 0 && album.count > 0 && (
            <span className="badge" style={{background: 'rgba(255,122,89,.85)', color: '#1a0a04', border: 0}}>
              none tagged
            </span>
          )}
        </div>
        {measured && (
          <div className="progress"><div className="fill" style={{width: taggedPct + '%'}}></div></div>
        )}
      </div>
      <div className="body">
        <div className="row1">
          <span className="name">{album.name}</span>
          <span className="when">{dateStr}</span>
        </div>
        <div className="meta">
          {measured ? (
            <React.Fragment>
              <span>{album.durationDays || 0}d span</span>
              <span className="pip"></span>
              <span>{tagged.toLocaleString()} / {(album.count ?? 0).toLocaleString()} tagged</span>
            </React.Fragment>
          ) : (
            <span style={{color: 'var(--ink-4)'}}>{(album.count ?? 0).toLocaleString()} items · scanning…</span>
          )}
        </div>
        {measured && album.recentTags.length > 0 ? (
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
        ) : measured ? (
          <div className="tagrow"><span className="dim" style={{fontStyle: 'italic'}}>No tags yet — start here</span></div>
        ) : (
          <div className="tagrow"><span className="dim">&nbsp;</span></div>
        )}
      </div>
    </article>
  );
}

function LongestVideosList({ onOpen }) {
  const { state } = useStore();
  const albums = state.albums || [];

  // Walk every loaded album's asset list and collect videos. Anything
  // not yet scanned by loadAllAlbumStats simply won't show up — the
  // progress banner above tells the user when scanning is still going.
  const videos = React.useMemo(() => {
    const byAlbumId = new Map(albums.map(a => [a.id, a]));
    const out = [];
    for (const [albumId, list] of Object.entries(state.albumAssets || {})) {
      const album = byAlbumId.get(albumId);
      if (!album || !Array.isArray(list)) continue;
      for (const a of list) {
        if (a.kind !== 'video') continue;
        out.push({
          id: a.id,
          name: a.name,
          duration: a.duration || 0,
          taken: a.taken,
          tagCount: (a.tags || []).length,
          albumId,
          albumName: album.name,
        });
      }
    }
    out.sort((a, b) => (b.duration || 0) - (a.duration || 0));
    return out;
  }, [state.albumAssets, state.albums]);

  const scannedAlbums = Object.keys(state.albumAssets || {}).length;
  const totalAlbums = albums.length;
  const stillScanning = scannedAlbums < totalAlbums;

  if (!state.loaded) {
    return <div className="home-grid scroll" style={{padding: 24, color: 'var(--ink-3)'}}>Loading…</div>;
  }

  if (videos.length === 0) {
    return (
      <div className="home-grid scroll" style={{padding: 32, textAlign: 'center', color: 'var(--ink-3)'}}>
        <div style={{fontSize: 14, marginBottom: 6}}>
          {stillScanning ? 'Scanning your library for videos…' : 'No videos found in any album.'}
        </div>
        <div style={{fontSize: 12, color: 'var(--ink-4)'}}>
          {stillScanning && `${scannedAlbums}/${totalAlbums} albums scanned. Hang tight.`}
        </div>
      </div>
    );
  }

  return (
    <div className="home-grid scroll">
      {videos.map(v => (
        <article key={v.id} className="albumcard"
                 onClick={() => onOpen(v.albumId, v.id)}
                 style={{minHeight: 200}}>
          <div className="cover" style={{position: 'relative'}}>
            <Thumb assetId={v.id} seed={v.id} kind="video" label={v.name} />
            <div className="badges">
              <span className="badge" style={{background: 'rgba(0,0,0,.7)', color: '#fff', border: 0, fontVariantNumeric: 'tabular-nums'}}>
                <Icon name="video" size={11} />
                {formatTime(v.duration)}
              </span>
            </div>
          </div>
          <div className="body">
            <div className="row1">
              <span className="name" style={{wordBreak: 'break-all'}}>{v.name}</span>
            </div>
            <div className="meta">
              <span>{v.albumName}</span>
              {v.taken && (
                <React.Fragment>
                  <span className="pip"></span>
                  <span>{v.taken}</span>
                </React.Fragment>
              )}
            </div>
            <div className="tagrow">
              <span className="dim">
                {v.tagCount === 0 ? 'No tags yet' : `${v.tagCount} tag${v.tagCount === 1 ? '' : 's'}`}
              </span>
            </div>
          </div>
        </article>
      ))}
    </div>
  );
}

window.Home = Home;

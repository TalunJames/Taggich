// TagPanel — applied tags + recent/suggested/all. Real Immich tag data.

function TagChip({ tag, applied, suggested, onToggle, size = 'md' }) {
  const color = tag.color || '#888';
  return (
    <button
      className={'tag-chip ' + (applied ? 'applied ' : '') + (suggested ? 'suggested ' : '') + (size === 'sm' ? 'sm ' : '') + (size === 'lg' ? 'lg ' : '')}
      onClick={() => onToggle && onToggle(tag.id)}
      style={applied ? {color: 'var(--ink)'} : {color}}>
      <span className="dot" style={{background: color}}></span>
      <span className="lbl" style={{color: applied ? 'var(--ink)' : 'var(--ink-2)'}}>{tag.name}</span>
      {!applied && tag.count != null && tag.count > 0 && size !== 'sm' && (
        <span className="cnt">{tag.count > 999 ? (tag.count/1000).toFixed(1) + 'k' : tag.count}</span>
      )}
      {applied && (
        <span className="x" onClick={e => { e.stopPropagation(); onToggle && onToggle(tag.id); }}>
          <Icon name="x" size={10} stroke={1.6} />
        </span>
      )}
    </button>
  );
}

function TagPanel({ asset, allAssets, onToggleTag, onOpenPalette, onOpenTagMgr, onDelete }) {
  const { state } = useStore();
  const tags = state.tags || [];
  const [q, setQ] = React.useState('');

  const appliedIds = asset ? asset.tags : [];
  const applied = appliedIds.map(id => tags.find(t => t.id === id)).filter(Boolean);

  // Recent in album: tags applied to other assets in the same album, by frequency.
  const inAlbumCounts = {};
  for (const a of (allAssets || [])) {
    if (asset && a.id === asset.id) continue;
    for (const tid of a.tags) inAlbumCounts[tid] = (inAlbumCounts[tid] || 0) + 1;
  }
  const recent = Object.entries(inAlbumCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([tid]) => tags.find(t => t.id === tid))
    .filter(t => t && !appliedIds.includes(t.id))
    .slice(0, 12);

  // Suggested: top library-wide tags not yet applied and not already in "recent".
  const recentIds = new Set(recent.map(t => t.id));
  const suggested = tags
    .filter(t => !appliedIds.includes(t.id) && !recentIds.has(t.id))
    .sort((a, b) => (b.count || 0) - (a.count || 0))
    .slice(0, 6);

  const all = tags
    .filter(t => !appliedIds.includes(t.id))
    .filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, 60);

  return (
    <aside className="pane right">
      <div className="pane-hd">
        <span className="title">Tags</span>
        <span className="sub mono">{applied.length} applied</span>
        <div style={{flex: 1}}></div>
        <button className="iconbtn" title="Open tag manager" onClick={onOpenTagMgr}
                style={{width: 26, height: 26, borderRadius: 6, color: 'var(--ink-3)', display: 'grid', placeItems: 'center'}}>
          <Icon name="sliders" />
        </button>
      </div>

      <div className="tagpanel">
        <div className="applied-area">
          <div className="section-lbl">
            <span>On this asset</span>
            <span className="mono dim">{applied.length}</span>
          </div>
          <div className="applied-chips">
            {applied.length === 0 && (
              <span style={{color: 'var(--ink-4)', fontSize: 12, padding: '4px 2px'}}>No tags yet. Press <span className="kbd">⌘K</span> to add.</span>
            )}
            {applied.map(t => (
              <TagChip key={t.id} tag={t} applied onToggle={onToggleTag} />
            ))}
          </div>
        </div>

        <div className="tag-search-area">
          <button className="btn" style={{justifyContent: 'space-between', height: 36, width: '100%', padding: '0 12px', background: 'var(--bg-2)'}}
                  onClick={onOpenPalette}>
            <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, color: 'var(--ink-3)'}}>
              <Icon name="search" />
              <span>Add or create tag…</span>
            </span>
            <span className="kbd">⌘K</span>
          </button>
          <div className="search">
            <span className="ico"><Icon name="search" /></span>
            <input className="input" placeholder="Quick filter tags" value={q} onChange={e => setQ(e.target.value)} />
          </div>
        </div>

        <div className="scroll-area scroll">
          {suggested.length > 0 && !q && (
            <div className="group">
              <div className="group-hd">
                <span style={{display: 'inline-flex', alignItems: 'center', gap: 6}}>
                  <Icon name="bolt" size={11} /> Suggested
                </span>
                <span className="mono dim">most used</span>
              </div>
              <div className="chips-wrap">
                {suggested.map(t => <TagChip key={t.id} tag={t} suggested onToggle={onToggleTag} />)}
              </div>
            </div>
          )}

          {recent.length > 0 && !q && (
            <div className="group">
              <div className="group-hd">
                <span>Recent</span>
                <span className="mono dim">in album</span>
              </div>
              <div className="chips-wrap">
                {recent.map(t => <TagChip key={t.id} tag={t} onToggle={onToggleTag} />)}
              </div>
            </div>
          )}

          <div className="group">
            <div className="group-hd">
              <span>{q ? 'Matches' : 'All tags'}</span>
              <span className="mono dim">{all.length}{!q && tags.length > all.length ? '/' + tags.length : ''}</span>
            </div>
            <div className="chips-wrap">
              {all.map(t => <TagChip key={t.id} tag={t} onToggle={onToggleTag} />)}
            </div>
            {q && all.length === 0 && (
              <button className="btn primary sm" style={{marginTop: 8}} onClick={onOpenPalette}>
                <Icon name="plus" size={12} /> Create tag "{q}"
              </button>
            )}
          </div>
        </div>

        <div className="actions-row">
          <button className="btn sm ghost"><Icon name="star" size={12} /> Favorite</button>
          <button className="btn sm ghost"><Icon name="download" size={12} /> Export</button>
          <div style={{flex: 1}}></div>
          <button className="btn sm danger" onClick={onDelete}><Icon name="trash" size={12} /> Delete</button>
        </div>
      </div>
    </aside>
  );
}

window.TagPanel = TagPanel;
window.TagChip = TagChip;

// TagManager — real tag list. Rename / color / delete / merge against Immich.

function TagManager() {
  const { state, actions, helpers } = useStore();
  const tags = state.tags || [];
  const [selectedId, setSelectedId] = React.useState(null);
  const [q, setQ] = React.useState('');
  const [mergeMode, setMergeMode] = React.useState(false);
  const [mergePicks, setMergePicks] = React.useState([]);   // [srcId, intoId]
  const [renameDraft, setRenameDraft] = React.useState('');
  const [creating, setCreating] = React.useState(false);
  const [newName, setNewName] = React.useState('');

  React.useEffect(() => {
    if (!selectedId && tags.length) setSelectedId(tags[0].id);
  }, [tags.length]);

  const filtered = tags
    .filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()))
    .sort((a, b) => (b.count || 0) - (a.count || 0));
  const maxCount = Math.max(1, ...tags.map(t => t.count || 0));
  const selected = tags.find(t => t.id === selectedId) || null;

  React.useEffect(() => {
    if (selected) setRenameDraft(selected.name);
  }, [selectedId]);

  const onToggleMergePick = (tagId) => {
    setMergePicks(prev => {
      if (prev.includes(tagId)) return prev.filter(x => x !== tagId);
      if (prev.length >= 2) return [prev[1], tagId];
      return [...prev, tagId];
    });
  };

  const doMerge = async () => {
    if (mergePicks.length !== 2) return;
    const [src, into] = mergePicks;
    const srcTag = tags.find(t => t.id === src);
    const intoTag = tags.find(t => t.id === into);
    if (!confirm(`Merge "${srcTag.name}" into "${intoTag.name}"?\nAll assets tagged "${srcTag.name}" will be retagged with "${intoTag.name}" and "${srcTag.name}" will be deleted.`)) return;
    try {
      await actions.mergeTags(src, into);
      setMergeMode(false);
      setMergePicks([]);
      if (selectedId === src) setSelectedId(into);
    } catch (e) {
      alert('Merge failed: ' + e.message);
    }
  };

  const doRename = async () => {
    if (!selected) return;
    const v = renameDraft.trim();
    if (!v || v === selected.name) return;
    try {
      await actions.renameTag(selected.id, v);
    } catch (e) {
      alert('Rename failed: ' + e.message);
    }
  };

  const doColor = async (hex) => {
    if (!selected) return;
    try {
      await actions.setTagColor(selected.id, hex);
    } catch (e) {
      alert('Set color failed: ' + e.message);
    }
  };

  const doDelete = async () => {
    if (!selected) return;
    if (!confirm(`Delete tag "${selected.name}"? It will be removed from ${(selected.count || 0).toLocaleString()} assets.`)) return;
    try {
      await actions.deleteTag(selected.id);
      setSelectedId(null);
    } catch (e) {
      alert('Delete failed: ' + e.message);
    }
  };

  const doCreate = async () => {
    const v = newName.trim();
    if (!v) return;
    try {
      const t = await actions.createTag(v);
      setNewName('');
      setCreating(false);
      setSelectedId(t.id);
    } catch (e) {
      alert('Create failed: ' + e.message);
    }
  };

  const totalUses = tags.reduce((s, t) => s + (t.count || 0), 0);

  return (
    <main className="tagmgr">
      <div className="tagmgr-main">
        <header className="tagmgr-hd">
          <div>
            <h1>Tag manager</h1>
            <div className="sub">{tags.length} tags · {totalUses.toLocaleString()} known uses</div>
          </div>
          <div style={{display: 'flex', gap: 8}}>
            <button className="btn" onClick={() => window.location.reload()}>
              <Icon name="refresh" size={13} /> Sync from Immich
            </button>
            <button className="btn primary" onClick={() => setCreating(c => !c)}>
              <Icon name="plus" size={13} /> New tag
            </button>
          </div>
        </header>

        {creating && (
          <div style={{display: 'flex', gap: 8, padding: '8px 20px', borderBottom: '1px solid var(--border)'}}>
            <input className="input" autoFocus placeholder="Tag name…" value={newName}
                   onChange={e => setNewName(e.target.value)}
                   onKeyDown={e => { if (e.key === 'Enter') doCreate(); if (e.key === 'Escape') { setCreating(false); setNewName(''); }}} />
            <button className="btn primary" onClick={doCreate}>Create</button>
            <button className="btn ghost" onClick={() => { setCreating(false); setNewName(''); }}>Cancel</button>
          </div>
        )}

        <div className="tagmgr-toolbar">
          <div className="search" style={{width: 280}}>
            <span className="ico"><Icon name="search" /></span>
            <input className="input" placeholder="Search tags" value={q} onChange={e => setQ(e.target.value)} />
          </div>
          <div style={{flex: 1}}></div>
          <button className={'btn ' + (mergeMode ? 'primary' : '')} onClick={() => { setMergeMode(m => !m); setMergePicks([]); }}>
            <Icon name="merge" size={13} /> Merge {mergeMode ? `(${mergePicks.length}/2 selected)` : ''}
          </button>
          {mergeMode && mergePicks.length === 2 && (
            <button className="btn primary" onClick={doMerge}>Merge → {tags.find(t => t.id === mergePicks[1])?.name}</button>
          )}
        </div>

        <div className="tagmgr-table scroll">
          <table>
            <thead>
              <tr>
                <th style={{width: 36}}>{mergeMode ? '✓' : ''}</th>
                <th>Tag</th>
                <th style={{width: 220}}>Usage</th>
                <th style={{width: 120}}>Updated</th>
                <th style={{width: 110}}></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map(t => {
                const isSelected = t.id === selectedId;
                const isPicked = mergePicks.includes(t.id);
                const onRowClick = mergeMode ? () => onToggleMergePick(t.id) : () => setSelectedId(t.id);
                const updated = (t.raw && (t.raw.updatedAt || t.raw.createdAt) || '').slice(0, 10) || '—';
                return (
                  <tr key={t.id} className={isSelected ? 'selected' : ''} onClick={onRowClick}>
                    <td>
                      {mergeMode ? (
                        <span style={{
                          display: 'inline-block', width: 14, height: 14, borderRadius: 4,
                          border: '1.5px solid var(--border-strong)',
                          background: isPicked ? 'var(--accent)' : 'transparent',
                        }}></span>
                      ) : (
                        <span style={{display: 'inline-block', width: 10, height: 10, borderRadius: 50, background: t.color}}></span>
                      )}
                    </td>
                    <td>
                      <span className="tag-cell">
                        {mergeMode && <span style={{width: 8, height: 8, borderRadius: 50, background: t.color, display: 'inline-block'}}></span>}
                        <span>{t.name}</span>
                      </span>
                    </td>
                    <td>
                      <span className="usage-bar">
                        <span className="fill" style={{width: ((t.count || 0) / maxCount * 100) + '%', background: t.color}}></span>
                      </span>
                      <span className="usage">{(t.count || 0).toLocaleString()}</span>
                    </td>
                    <td className="muted mono" style={{fontSize: 11.5}}>{updated}</td>
                    <td>
                      <span className="row-actions">
                        <button className="btn sm ghost" title="Rename"
                                onClick={e => { e.stopPropagation(); setSelectedId(t.id); }}>
                          <Icon name="edit" size={12} />
                        </button>
                        <button className="btn sm ghost" title="Merge into…"
                                onClick={e => { e.stopPropagation(); setMergeMode(true); setMergePicks([t.id]); }}>
                          <Icon name="merge" size={12} />
                        </button>
                        <button className="btn sm ghost danger" title="Delete"
                                onClick={async e => { e.stopPropagation(); setSelectedId(t.id); await new Promise(r => setTimeout(r)); doDelete(); }}>
                          <Icon name="trash" size={12} />
                        </button>
                      </span>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr><td colSpan="5" style={{padding: 24, color: 'var(--ink-4)'}}>No tags.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {selected && (
        <aside className="tagmgr-side">
          <div className="tagmgr-side-hd">
            <div>
              <span className="dot" style={{background: selected.color}}></span>
              <span className="name">{selected.name}</span>
            </div>
            <div className="meta">
              <span className="mono">{(selected.count || 0).toLocaleString()}</span> known assets ·
              created <span className="mono">{(selected.raw?.createdAt || '').slice(0, 10) || '—'}</span>
            </div>
          </div>
          <div className="tagmgr-side-body scroll">
            <div className="group">
              <h4>Color</h4>
              <div style={{display: 'flex', gap: 6, flexWrap: 'wrap'}}>
                {helpers.PALETTE_HEX.map((hex, i) => (
                  <button key={hex} onClick={() => doColor(hex)} title={helpers.PALETTE_NAMES[i]}
                          style={{
                            width: 22, height: 22, borderRadius: 50, background: hex,
                            outline: hex.toLowerCase() === (selected.color || '').toLowerCase() ? '2px solid var(--ink)' : 'none',
                            outlineOffset: 2, border: 0, padding: 0, cursor: 'pointer',
                          }}></button>
                ))}
              </div>
            </div>

            <div className="group">
              <h4>Rename</h4>
              <div style={{display: 'flex', gap: 6}}>
                <input className="input" value={renameDraft} onChange={e => setRenameDraft(e.target.value)}
                       onKeyDown={e => e.key === 'Enter' && doRename()} />
                <button className="btn primary" onClick={doRename} disabled={renameDraft.trim() === selected.name}>
                  Save
                </button>
              </div>
            </div>

            <div className="merge-card">
              <h4 style={{margin: 0, font: '600 10px var(--font-sans)', letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--ink-4)'}}>Quick actions</h4>
              <button className="btn" onClick={() => { setMergeMode(true); setMergePicks([selected.id]); }}>
                <Icon name="merge" size={13} /> Merge into another tag…
              </button>
              <button className="btn danger" onClick={doDelete}>
                <Icon name="trash" size={13} /> Delete tag
              </button>
              <div className="dim" style={{fontSize: 11, lineHeight: 1.45}}>
                Deleting removes the tag from every asset that has it. Assets are not deleted.
              </div>
            </div>
          </div>
        </aside>
      )}
    </main>
  );
}

window.TagManager = TagManager;

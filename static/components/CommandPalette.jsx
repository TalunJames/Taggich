// CommandPalette — ⌘K overlay. Filter tags, Enter applies, Create makes a new tag.

function CommandPalette({ open, onClose, assetTags = [], onToggleTag, onCreateAndApply, assetName }) {
  const { state } = useStore();
  const tags = state.tags || [];
  const [q, setQ] = React.useState('');
  const [idx, setIdx] = React.useState(0);
  const [working, setWorking] = React.useState(false);
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (open) {
      setQ('');
      setIdx(0);
      setWorking(false);
      setTimeout(() => inputRef.current && inputRef.current.focus(), 30);
    }
  }, [open]);

  if (!open) return null;

  const matches = tags.filter(t => !q || t.name.toLowerCase().includes(q.toLowerCase()));
  const showCreate = !!q.trim() && !tags.some(t => t.name.toLowerCase() === q.trim().toLowerCase());
  const items = matches.slice(0, 12);
  const total = items.length + (showCreate ? 1 : 0);

  const submit = async () => {
    if (working) return;
    if (idx < items.length) {
      onToggleTag && onToggleTag(items[idx].id);
      onClose();
    } else if (showCreate) {
      setWorking(true);
      try { await onCreateAndApply(q.trim()); } finally { setWorking(false); onClose(); }
    }
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { onClose(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); setIdx(i => Math.min(i + 1, Math.max(0, total - 1))); }
    if (e.key === 'ArrowUp') { e.preventDefault(); setIdx(i => Math.max(i - 1, 0)); }
    if (e.key === 'Enter') {
      e.preventDefault();
      submit();
    }
  };

  return (
    <div className="cmd-backdrop" onClick={onClose}>
      <div className="cmd" onClick={e => e.stopPropagation()}>
        <div className="cmd-input-row">
          <Icon name="search" size={18} style={{color: 'var(--ink-3)'}} />
          <input
            ref={inputRef}
            placeholder="Type to filter tags, or create a new one…"
            value={q}
            onKeyDown={onKey}
            onChange={e => { setQ(e.target.value); setIdx(0); }} />
          <span className="kbd">esc</span>
        </div>
        <div className="cmd-list scroll">
          {items.length > 0 && (
            <React.Fragment>
              <div className="cmd-section">Tags</div>
              {items.map((t, i) => {
                const applied = assetTags.includes(t.id);
                return (
                  <div key={t.id} className="cmd-item"
                       aria-selected={i === idx}
                       onMouseEnter={() => setIdx(i)}
                       onClick={() => { onToggleTag && onToggleTag(t.id); onClose(); }}>
                    <span className="ico"><span style={{width: 8, height: 8, borderRadius: 50, background: t.color, display: 'block'}}></span></span>
                    <span className="lbl">
                      {q ? highlight(t.name, q) : t.name}
                    </span>
                    <span className="hint mono">{(t.count || 0).toLocaleString()} uses</span>
                    {applied
                      ? <span className="applied-bullet"><Icon name="check" size={8} stroke={2.2} /></span>
                      : <span className="kbd">↵</span>}
                  </div>
                );
              })}
            </React.Fragment>
          )}
          {showCreate && (
            <React.Fragment>
              <div className="cmd-section">Create</div>
              <div className="cmd-item"
                   aria-selected={idx === items.length}
                   onMouseEnter={() => setIdx(items.length)}
                   onClick={submit}>
                <span className="ico"><Icon name="plus" /></span>
                <span className="lbl">Create new tag "<span style={{color: 'var(--accent)'}}>{q}</span>"</span>
                <span className="hint">{working ? 'creating…' : 'applies to current asset'}</span>
                <span className="kbd">↵</span>
              </div>
            </React.Fragment>
          )}
          {!items.length && !showCreate && (
            <div style={{padding: '40px 14px', textAlign: 'center', color: 'var(--ink-4)', fontSize: 12.5}}>
              No matches.
            </div>
          )}
        </div>
        <div className="cmd-footer">
          <span className="grp"><span className="kbd">↑</span><span className="kbd">↓</span> navigate</span>
          <span className="grp"><span className="kbd">↵</span> apply</span>
          <span style={{flex: 1}}></span>
          {assetName && <span className="grp dim">Tagging {assetName}</span>}
        </div>
      </div>
    </div>
  );
}

function highlight(text, q) {
  if (!q) return text;
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0) return text;
  return (
    <React.Fragment>
      {text.slice(0, i)}
      <span style={{color: 'var(--accent)', fontWeight: 600}}>{text.slice(i, i + q.length)}</span>
      {text.slice(i + q.length)}
    </React.Fragment>
  );
}

window.CommandPalette = CommandPalette;

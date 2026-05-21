// sort.jsx — shared album-sort options used by the Sidebar and Home screens.

const SORT_OPTIONS = [
  { key: 'updated',        label: 'Most recently updated' },
  { key: 'updated_asc',    label: 'Oldest first' },
  { key: 'name',           label: 'Name (A → Z)' },
  { key: 'name_desc',      label: 'Name (Z → A)' },
  { key: 'size',           label: 'Most photos' },
  { key: 'size_asc',       label: 'Fewest photos' },
  { key: 'untagged_pct',   label: 'Most untagged (%)' },
  { key: 'untagged_count', label: 'Most untagged (count)' },
  { key: 'tagged_pct',     label: 'Most tagged (%)' },
];

function sortLabelFor(key) {
  const o = SORT_OPTIONS.find(x => x.key === key);
  return o ? o.label : key;
}

// Unmeasured albums (statsLoaded === false) sort to the END of any tag-based
// sort, since we don't know their tagged count yet.
function sortAlbums(albums, key) {
  const arr = [...albums];
  const safeStr = (s) => (s || '');
  const taggedPct = (a) => (a.count ? (a.tagged || 0) / a.count : 0);
  const untaggedPct = (a) => (a.count ? Math.max(0, a.count - (a.tagged || 0)) / a.count : 0);
  const untaggedCount = (a) => Math.max(0, (a.count || 0) - (a.tagged || 0));

  const cmpMeasuredFirst = (a, b) => {
    if (a.statsLoaded && !b.statsLoaded) return -1;
    if (!a.statsLoaded && b.statsLoaded) return 1;
    return 0;
  };

  switch (key) {
    case 'updated':
      return arr.sort((a, b) => safeStr(b.updated).localeCompare(safeStr(a.updated)));
    case 'updated_asc':
      return arr.sort((a, b) => safeStr(a.updated).localeCompare(safeStr(b.updated)));
    case 'name':
      return arr.sort((a, b) => safeStr(a.name).localeCompare(safeStr(b.name)));
    case 'name_desc':
      return arr.sort((a, b) => safeStr(b.name).localeCompare(safeStr(a.name)));
    case 'size':
      return arr.sort((a, b) => (b.count || 0) - (a.count || 0));
    case 'size_asc':
      return arr.sort((a, b) => (a.count || 0) - (b.count || 0));
    case 'untagged_pct':
      return arr.sort((a, b) => cmpMeasuredFirst(a, b) || (untaggedPct(b) - untaggedPct(a)));
    case 'untagged_count':
      return arr.sort((a, b) => cmpMeasuredFirst(a, b) || (untaggedCount(b) - untaggedCount(a)));
    case 'tagged_pct':
      return arr.sort((a, b) => cmpMeasuredFirst(a, b) || (taggedPct(b) - taggedPct(a)));
    default:
      return arr;
  }
}

// SortMenu — small dropdown button. Closes on outside click / Escape.
// Pass `compact` for a tighter look (used inside the Sidebar).
function SortMenu({ value, onChange, compact = false }) {
  const [open, setOpen] = React.useState(false);
  const rootRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      if (rootRef.current && !rootRef.current.contains(e.target)) setOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{position: 'relative', display: 'inline-flex'}}>
      <button
        className={'btn ' + (compact ? 'sm ghost' : 'ghost')}
        onClick={() => setOpen(o => !o)}
        title="Change sort order"
        style={compact ? {gap: 4, padding: '0 6px', height: 22, fontSize: 11, color: 'var(--ink-3)'} : null}
      >
        <Icon name="chevD" size={compact ? 10 : 13} />
        {compact
          ? <span>{sortLabelFor(value)}</span>
          : <span>Sort: {sortLabelFor(value)}</span>}
      </button>
      {open && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 50,
          minWidth: 200,
          background: 'var(--bg-1)',
          border: '1px solid var(--border)',
          borderRadius: 8,
          boxShadow: '0 12px 40px rgba(0,0,0,.35)',
          padding: 4,
          display: 'flex', flexDirection: 'column',
        }}>
          {SORT_OPTIONS.map(opt => {
            const active = opt.key === value;
            return (
              <button
                key={opt.key}
                onClick={() => { onChange(opt.key); setOpen(false); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8,
                  padding: '6px 10px', borderRadius: 6,
                  fontSize: 12, color: active ? 'var(--ink)' : 'var(--ink-2)',
                  background: active ? 'var(--bg-2)' : 'transparent',
                  textAlign: 'left',
                }}
                onMouseEnter={(e) => { if (!active) e.currentTarget.style.background = 'var(--bg-2)'; }}
                onMouseLeave={(e) => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <span style={{width: 12, display: 'inline-flex', justifyContent: 'center'}}>
                  {active ? <Icon name="check" size={11} stroke={2} /> : null}
                </span>
                <span>{opt.label}</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

window.SORT_OPTIONS = SORT_OPTIONS;
window.sortAlbums = sortAlbums;
window.sortLabelFor = sortLabelFor;
window.SortMenu = SortMenu;

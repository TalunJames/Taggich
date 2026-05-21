// Icon set — outline strokes, 16px viewBox. Single source so all icons match.
// Each icon takes optional size + color (currentColor by default).

const ICONS = {
  search:       'M11 11l3.5 3.5 M11 7a4 4 0 1 1 -8 0 a4 4 0 0 1 8 0',
  x:            'M3 3l10 10 M13 3l-10 10',
  plus:         'M8 3v10 M3 8h10',
  check:        'M3 8l3.5 3.5L13 4.5',
  chevL:        'M9.5 3l-4 5l4 5',
  chevR:        'M6.5 3l4 5l-4 5',
  chevD:        'M3 6l5 4l5 -4',
  chevU:        'M3 10l5 -4l5 4',
  play:         'M4 3l9 5l-9 5 z',
  pause:        'M5 3v10 M11 3v10',
  prev:         'M11 3l-5 5l5 5 M5 3v10',
  next:         'M5 3l5 5l-5 5 M11 3v10',
  stepF:        'M3 3l6 5l-6 5z M11 3v10',
  stepB:        'M13 3l-6 5l6 5z M5 3v10',
  loop:         'M3 6a3 3 0 0 1 3 -3h7 M13 3l2 2l-2 2 M13 10a3 3 0 0 1 -3 3h-7 M3 13l-2 -2l2 -2',
  speed:        'M2 11a6 6 0 1 1 12 0 M8 5v3l2 2',
  volume:       'M3 6h3l3 -3v10l-3 -3h-3z M11 5a4 4 0 0 1 0 6',
  mute:         'M3 6h3l3 -3v10l-3 -3h-3z M11 5l4 6 M15 5l-4 6',
  fs:           'M3 6V3h3 M10 3h3v3 M3 10v3h3 M13 10v3h-3',
  picture:      'M2 4h12v8h-12z M5 8l2 2l4 -4l3 3',
  film:         'M3 3h10v10h-10z M3 5h2 M3 8h2 M3 11h2 M11 5h2 M11 8h2 M11 11h2',
  tag:          'M2 2h6l6 6l-6 6l-6 -6z M5 5h.01',
  trash:        'M3 4h10 M5 4V3h6v1 M5 4l1 9h4l1 -9',
  more:         'M4 8h.01 M8 8h.01 M12 8h.01',
  download:     'M8 2v9 M4 7l4 4l4 -4 M3 13h10',
  refresh:      'M13 8a5 5 0 1 1 -1.5 -3.5 L13 6 M13 3v3h-3',
  star:         'M8 2l1.8 3.7l4.2 .5l-3 3l.8 4.2l-3.8 -2l-3.8 2l.8 -4.2l-3 -3l4.2 -.5z',
  flag:         'M3 14V2 M3 2h9l-2 3l2 3h-9',
  edit:         'M3 13h2.5l7.5 -7.5l-2.5 -2.5l-7.5 7.5z',
  merge:        'M4 2v3a4 4 0 0 0 4 4h4 M12 2v3a4 4 0 0 1 -4 4 M12 9l2 -2 M12 9l2 2 M4 14V9',
  user:         'M8 8a3 3 0 1 0 0 -6a3 3 0 0 0 0 6 M3 14a5 5 0 0 1 10 0',
  layers:       'M8 2l6 3l-6 3l-6 -3z M2 8l6 3l6 -3 M2 11l6 3l6 -3',
  grid:         'M3 3h4v4h-4z M9 3h4v4h-4z M3 9h4v4h-4z M9 9h4v4h-4z',
  rows:         'M3 4h10 M3 8h10 M3 12h10',
  kbd:          'M2 5h12v6h-12z M4 7h.01 M6 7h.01 M8 7h.01 M10 7h.01 M12 7h.01 M5 9h6',
  sun:          'M8 4v-2 M8 14v-2 M2 8h2 M12 8h2 M3.5 3.5l1.4 1.4 M11.1 11.1l1.4 1.4 M3.5 12.5l1.4 -1.4 M11.1 4.9l1.4 -1.4 M8 6a2 2 0 1 1 0 4 a2 2 0 0 1 0 -4',
  moon:         'M13 9.5a5 5 0 1 1 -6.5 -6.5a4 4 0 0 0 6.5 6.5z',
  sliders:      'M3 4h6 M11 4h2 M3 8h2 M7 8h6 M3 12h8 M13 12h0 M9 3v2 M5 7v2 M11 11v2',
  link:         'M9 5l2 -2a2.5 2.5 0 0 1 3.5 3.5l-2 2 M7 11l-2 2a2.5 2.5 0 0 1 -3.5 -3.5l2 -2 M6 10l4 -4',
  album:        'M2 3h7l1.5 2H14v8H2z',
  video:        'M2 4h9v8h-9z M11 7l3 -2v6l-3 -2z',
  marker:       'M8 1v14 M3 5l5 -2l5 2',
  abloop:       'M3 5a3 3 0 0 1 3 -3h4a3 3 0 0 1 3 3v0 M3 11a3 3 0 0 0 3 3h4a3 3 0 0 0 3 -3v0 M5 8h6',
  comments:     'M2 3h12v8h-7l-3 3v-3h-2z',
  bolt:         'M9 2l-5 7h4l-1 5l5 -7h-4z',
  filter:       'M2 3h12l-5 6v5l-2 -1v-4z',
};

function Icon({ name, size = 16, stroke = 1.4, fill = false, style }) {
  const d = ICONS[name];
  if (!d) return null;
  return (
    <svg width={size} height={size} viewBox="0 0 16 16" style={style}>
      <path d={d}
        fill={fill ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={stroke}
        strokeLinecap="round"
        strokeLinejoin="round" />
    </svg>
  );
}

window.Icon = Icon;

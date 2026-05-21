// Placeholder image generator — generates striped SVG previews
// so we don't fake actual photography. Deterministic by seed.

function hashStr(s) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
  return Math.abs(h);
}

const COVER_PALETTES = [
  // [bg-start, bg-end, stripe]
  ['#1f2937', '#0f172a', '#374151'],
  ['#2a1a14', '#160a04', '#3f2316'],
  ['#0e3a2b', '#062018', '#0f5d3f'],
  ['#3a1a3a', '#1c0d1c', '#5e2a5e'],
  ['#1a2a3a', '#0a1322', '#2d4a6e'],
  ['#3a2a14', '#1a1208', '#5e4622'],
  ['#0e3344', '#04181f', '#10546e'],
  ['#2d1414', '#160808', '#5e2222'],
  ['#1a3a2a', '#0a1c14', '#2a6e4a'],
  ['#2a1a3a', '#15102a', '#4a2a6e'],
];

function PlaceholderImage({ seed = 'x', label = '', kind = 'photo' }) {
  const h = hashStr(seed);
  const pal = COVER_PALETTES[h % COVER_PALETTES.length];
  const rot = (h % 60) - 30;
  const stripeW = 14 + (h % 18);
  const id = 'ph-' + (h % 100000);
  return (
    <svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" className="ph-img" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={id + '-g'} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor={pal[0]} />
          <stop offset="100%" stopColor={pal[1]} />
        </linearGradient>
        <pattern id={id + '-p'} width={stripeW} height={stripeW} patternUnits="userSpaceOnUse" patternTransform={`rotate(${rot})`}>
          <rect width={stripeW} height={stripeW} fill="transparent" />
          <rect width={stripeW/2} height={stripeW} fill={pal[2]} opacity=".35" />
        </pattern>
      </defs>
      <rect width="400" height="300" fill={`url(#${id}-g)`} />
      <rect width="400" height="300" fill={`url(#${id}-p)`} />
      {kind === 'video' && (
        <g opacity=".9">
          <circle cx="200" cy="150" r="28" fill="rgba(0,0,0,.4)" />
          <path d="M192 138 L192 162 L214 150 Z" fill="rgba(255,255,255,.95)" />
        </g>
      )}
      {label && (
        <text x="14" y="288" fontFamily="ui-monospace, 'Geist Mono', Menlo, monospace"
              fontSize="11" fill="rgba(255,255,255,.55)">
          {label}
        </text>
      )}
    </svg>
  );
}

window.PlaceholderImage = PlaceholderImage;

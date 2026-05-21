// Thumb — render a real Immich thumbnail when an asset id is available,
// otherwise fall back to the design's PlaceholderImage.

function Thumb({ assetId, seed, kind = 'photo', label, size = 'preview', className }) {
  const [loaded, setLoaded] = React.useState(false);
  const [failed, setFailed] = React.useState(false);
  React.useEffect(() => { setLoaded(false); setFailed(false); }, [assetId]);

  if (!assetId || failed) {
    return <PlaceholderImage seed={seed || assetId || 'x'} kind={kind} label={label} />;
  }
  const src = `/api/assets/${assetId}/thumbnail?size=${size}`;
  // The img stays absolute-positioned and laid out from the start — we fade
  // it in with opacity instead of toggling display. `loading="lazy"` uses
  // IntersectionObserver, and elements with display:none have no box, so
  // they're treated as off-screen and never fetched.
  return (
    <React.Fragment>
      {!loaded && <PlaceholderImage seed={seed || assetId} kind={kind} />}
      <img
        src={src}
        alt={label || ''}
        loading="lazy"
        onLoad={() => setLoaded(true)}
        onError={() => setFailed(true)}
        className={className}
        style={{
          position: 'absolute', inset: 0,
          width: '100%', height: '100%', objectFit: 'cover',
          opacity: loaded ? 1 : 0,
          transition: 'opacity 120ms',
        }}
      />
    </React.Fragment>
  );
}

window.Thumb = Thumb;

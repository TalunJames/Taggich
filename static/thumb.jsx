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
          width: '100%', height: '100%', objectFit: 'cover',
          display: loaded ? 'block' : 'none',
          position: loaded ? 'absolute' : 'static', inset: 0,
        }}
      />
    </React.Fragment>
  );
}

window.Thumb = Thumb;

// MediaViewer — real photos via thumbnail endpoint, real videos via /stream.

function formatTime(s) {
  s = Math.max(0, Math.floor(s || 0));
  const m = Math.floor(s / 60);
  const ss = (s % 60).toString().padStart(2, '0');
  return `${m}:${ss}`;
}
function formatFrame(s, fps = 30) {
  const total = Math.max(0, Math.floor((s || 0) * fps));
  const m = Math.floor(total / fps / 60);
  const sec = Math.floor(total / fps) % 60;
  const f = total % fps;
  return `${m.toString().padStart(2,'0')}:${sec.toString().padStart(2,'0')}.${f.toString().padStart(2,'0')}`;
}

function VideoControls({ videoRef, duration }) {
  const [playing, setPlaying] = React.useState(false);
  const [t, setT] = React.useState(0);
  const [vol, setVol] = React.useState(1);
  const [muted, setMuted] = React.useState(false);
  const [speed, setSpeed] = React.useState(1);
  const [loop, setLoop] = React.useState(false);
  const [showSpeed, setShowSpeed] = React.useState(false);
  const [hoverPct, setHoverPct] = React.useState(null);
  const trackRef = React.useRef(null);

  // Mirror video element state into the controls.
  React.useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onTime = () => setT(v.currentTime);
    const onVol = () => { setVol(v.volume); setMuted(v.muted); };
    const onRate = () => setSpeed(v.playbackRate);
    v.addEventListener('play', onPlay);
    v.addEventListener('pause', onPause);
    v.addEventListener('timeupdate', onTime);
    v.addEventListener('volumechange', onVol);
    v.addEventListener('ratechange', onRate);
    return () => {
      v.removeEventListener('play', onPlay);
      v.removeEventListener('pause', onPause);
      v.removeEventListener('timeupdate', onTime);
      v.removeEventListener('volumechange', onVol);
      v.removeEventListener('ratechange', onRate);
    };
  }, [videoRef]);

  const safeDur = duration || (videoRef.current && videoRef.current.duration) || 1;
  const pct = Math.min(100, (t / safeDur) * 100);
  const buffered = Math.min(100, pct + 12);

  const togglePlay = () => {
    const v = videoRef.current; if (!v) return;
    if (v.paused) v.play(); else v.pause();
  };
  const setTime = (sec) => {
    const v = videoRef.current; if (!v) return;
    v.currentTime = Math.max(0, Math.min(safeDur, sec));
  };
  const setVolume = (val) => {
    const v = videoRef.current; if (!v) return;
    v.volume = Math.max(0, Math.min(1, val));
    if (val > 0) v.muted = false;
  };
  const toggleMute = () => {
    const v = videoRef.current; if (!v) return;
    v.muted = !v.muted;
  };
  const setRate = (val) => {
    const v = videoRef.current; if (!v) return;
    v.playbackRate = val; setShowSpeed(false);
  };
  const toggleLoop = () => {
    const v = videoRef.current; if (!v) return;
    v.loop = !v.loop; setLoop(v.loop);
  };
  const toggleFs = () => {
    const v = videoRef.current; if (!v) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else v.requestFullscreen && v.requestFullscreen();
  };

  const onScrubMove = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setHoverPct((x / rect.width) * 100);
  };
  const onScrubClick = (e) => {
    if (!trackRef.current) return;
    const rect = trackRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
    setTime((x / rect.width) * safeDur);
  };

  const hoverTime = hoverPct != null ? (hoverPct / 100) * safeDur : null;

  return (
    <div className="vid-controls" onClick={e => e.stopPropagation()}>
      <div className="vid-scrub"
           ref={trackRef}
           onMouseMove={onScrubMove}
           onMouseLeave={() => setHoverPct(null)}
           onClick={onScrubClick}
           style={{cursor: 'pointer'}}>
        <div className="track">
          <div className="buffered" style={{width: buffered + '%'}}></div>
          <div className="played" style={{width: pct + '%'}}></div>
        </div>
        <div className="thumb" style={{left: pct + '%'}}></div>
        {hoverPct != null && (
          <div className="hover-preview" style={{left: hoverPct + '%'}}>
            <span>{formatFrame(hoverTime)}</span>
          </div>
        )}
      </div>
      <div className="vid-row">
        <button className="vid-btn lg" onClick={togglePlay}>
          <Icon name={playing ? 'pause' : 'play'} size={18} stroke={1.6} fill={!playing} />
        </button>
        <button className="vid-btn" title="Back 5s" onClick={() => setTime(t - 5)}><Icon name="stepB" /></button>
        <button className="vid-btn" title="Forward 5s" onClick={() => setTime(t + 5)}><Icon name="stepF" /></button>
        <div className="vol">
          <button className="vid-btn" style={{width: 24, height: 24}} onClick={toggleMute}>
            <Icon name={muted ? 'mute' : 'volume'} />
          </button>
          <div className="bar" onClick={(e) => {
            const r = e.currentTarget.getBoundingClientRect();
            setVolume((e.clientX - r.left) / r.width);
          }} style={{cursor: 'pointer'}}>
            <div className="fill" style={{width: (muted ? 0 : vol * 100) + '%'}}></div>
            <div className="knob" style={{left: (muted ? 0 : vol * 100) + '%'}}></div>
          </div>
        </div>
        <div className="vid-time">
          <span>{formatTime(t)}</span>
          <span className="sep">/</span>
          <span style={{color: 'rgba(255,255,255,.55)'}}>{formatTime(safeDur)}</span>
        </div>
        <div className="grow"></div>
        <button className="vid-btn" title="Loop (l)" aria-pressed={loop} onClick={toggleLoop}>
          <Icon name="loop" />
        </button>
        <div style={{position: 'relative'}}>
          <button className="vid-btn" title="Speed" aria-pressed={showSpeed} onClick={() => setShowSpeed(s => !s)}
                  style={{width: 'auto', padding: '0 10px', font: '600 12px var(--font-mono)'}}>
            {speed}×
          </button>
          {showSpeed && (
            <div className="speed-menu">
              {[0.25, 0.5, 0.75, 1, 1.25, 1.5, 2].map(v => (
                <button key={v} className="opt" aria-current={v === speed} onClick={() => setRate(v)}>
                  <span>{v}×</span>
                  {v === speed && <Icon name="check" size={12} />}
                </button>
              ))}
            </div>
          )}
        </div>
        <button className="vid-btn" title="Fullscreen (f)" onClick={toggleFs}><Icon name="fs" /></button>
      </div>
    </div>
  );
}

function MediaViewer({ asset, assets, onPrev, onNext, onToggleFocus, focus, onDelete }) {
  const videoRef = React.useRef(null);
  const isVideo = asset && asset.kind === 'video';
  // Default to the original file. Some Immich versions return a
  // fixed-aspect (often square) thumbnail for `preview`/`fullsize` even on
  // portrait photos, which crops the image. The original is the
  // untranscoded file — for JPEG/PNG that's exactly what the user shot;
  // for HEIC the browser can't decode it and we auto-fall-back below.
  const [photoSrc, setPhotoSrc] = React.useState('original');
  const [originalLoaded, setOriginalLoaded] = React.useState(false);
  React.useEffect(() => {
    setPhotoSrc('original');
    setOriginalLoaded(false);
  }, [asset && asset.id]);

  if (!asset) {
    return (
      <div className="viewer">
        <div className="viewer-stage">
          <div style={{color: 'var(--ink-4)', padding: 24}}>No asset selected.</div>
        </div>
      </div>
    );
  }

  return (
    <div className="viewer">
      <div className={'viewer-stage ' + (isVideo ? 'video' : '')}>
        <div className="viewer-overlay-top">
          <div className="viewer-chip mono">
            <span style={{color: 'rgba(255,255,255,.55)'}}>{asset.name}</span>
          </div>
          <div className="viewer-chip">
            <Icon name={isVideo ? 'video' : 'picture'} size={12} />
            {isVideo
              ? <span>Video{asset.duration ? ` · ${formatTime(asset.duration)}` : ''}</span>
              : <span>Photo</span>}
          </div>
          {asset.taken && (
            <div className="viewer-chip">
              <span style={{color: 'rgba(255,255,255,.55)'}}>{asset.taken}</span>
            </div>
          )}
          <div style={{flex: 1}}></div>
          {!isVideo && (
            <button className="viewer-chip"
                    onClick={() => setPhotoSrc(s => s === 'original' ? 'fullsize' : 'original')}
                    title={photoSrc === 'original'
                      ? 'Switch to faster preview (may be cropped on some Immich versions)'
                      : 'Switch back to the original untranscoded file'}>
              <Icon name="picture" size={12} />
              <span>{photoSrc === 'original' ? 'Original' : 'Preview'}</span>
            </button>
          )}
          <button className="viewer-chip" onClick={onToggleFocus}>
            <Icon name={focus ? 'rows' : 'fs'} size={12} />
            <span>{focus ? 'Exit focus' : 'Focus mode'}</span>
            <span className="kbd" style={{background: 'rgba(255,255,255,.12)', color: 'rgba(255,255,255,.8)', border: 0}}>F</span>
          </button>
          <button className="viewer-chip danger" title="Delete asset" onClick={onDelete} style={{color: '#ff8a8a'}}>
            <Icon name="trash" size={12} />
            <span>Delete</span>
          </button>
        </div>

        <button className="nav-arrow left" onClick={onPrev}><Icon name="chevL" size={20} /></button>
        <button className="nav-arrow right" onClick={onNext}><Icon name="chevR" size={20} /></button>

        {isVideo ? (
          <div className="viewer-frame video">
            <video
              ref={videoRef}
              key={asset.id}
              src={`/api/assets/${asset.id}/stream`}
              controls={false}
              preload="metadata"
              playsInline
              style={{
                position: 'absolute', inset: 0,
                width: '100%', height: '100%',
                objectFit: 'contain',
                background: '#000',
              }}
            />
            <VideoControls key={asset.id} videoRef={videoRef} duration={asset.duration || 60} />
          </div>
        ) : (
          /* Photo — progressive: render the preview thumbnail (small, fast,
             usually already in the browser cache because the filmstrip
             pulled it) immediately, then fade in the original when it
             loads. Wrapper has a definite size; img inside uses
             max-width/max-height 100% which then resolves correctly. */
          <div style={{
            position: 'absolute',
            top: 24, left: 24, right: 24, bottom: 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {/* Placeholder: the preview thumbnail. Hidden once the
                original/fullsize is loaded. Skipped when the user has
                explicitly switched to a non-original src. */}
            {photoSrc === 'original' && !originalLoaded && (
              <img
                key={`preview-${asset.id}`}
                src={`/api/assets/${asset.id}/thumbnail?size=preview`}
                alt=""
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  maxWidth: '100%', maxHeight: '100%',
                  width: 'auto', height: 'auto',
                  objectFit: 'contain', display: 'block',
                  filter: 'drop-shadow(0 20px 50px rgba(0,0,0,.45)) blur(1px)',
                  transition: 'opacity 200ms',
                  opacity: 0.9,
                }}
              />
            )}
            <img
              key={`${asset.id}:${photoSrc}`}
              src={photoSrc === 'original'
                    ? `/api/assets/${asset.id}/stream`
                    : `/api/assets/${asset.id}/thumbnail?size=${photoSrc}`}
              alt={asset.name}
              onLoad={() => setOriginalLoaded(true)}
              onError={() => {
                if (photoSrc === 'original') setPhotoSrc('fullsize');
                else if (photoSrc === 'fullsize') setPhotoSrc('preview');
                setOriginalLoaded(true);
              }}
              style={{
                position: 'relative',
                maxWidth: '100%',
                maxHeight: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
                filter: 'drop-shadow(0 20px 50px rgba(0,0,0,.45))',
                opacity: photoSrc !== 'original' || originalLoaded ? 1 : 0,
                transition: 'opacity 180ms',
              }}
            />
          </div>
        )}
      </div>

      <Filmstrip currentId={asset.id} assets={assets} />
    </div>
  );
}

function Filmstrip({ currentId, assets }) {
  const scrollRef = React.useRef(null);
  const list = assets || [];
  React.useEffect(() => {
    if (!scrollRef.current) return;
    const el = scrollRef.current.querySelector('[aria-current="true"]');
    if (el && el.scrollIntoView) el.scrollIntoView({behavior: 'smooth', inline: 'center', block: 'nearest'});
  }, [currentId]);
  return (
    <React.Fragment>
      <div className="filmstrip-hd">
        <span><span className="mono">{Math.max(0, list.findIndex(a => a.id === currentId)) + 1}</span> / <span className="mono">{list.length}</span> in album · use <span className="kbd">←</span> <span className="kbd">→</span> to navigate</span>
        <span>Sort: Date taken ↑</span>
      </div>
      <div className="filmstrip scroll" ref={scrollRef}>
        {list.map(a => (
          <div key={a.id} className="frame" aria-current={a.id === currentId} style={{position: 'relative'}}>
            <Thumb assetId={a.id} seed={a.id} kind={a.kind} />
            {a.kind === 'video' && a.duration && (
              <span className="badge">{formatTime(a.duration)}</span>
            )}
            {a.tags.length > 0 && (
              <span className="tagged" style={{background: 'var(--accent)', color: 'var(--accent-ink)'}}>{a.tags.length}</span>
            )}
          </div>
        ))}
      </div>
    </React.Fragment>
  );
}

window.MediaViewer = MediaViewer;
window.formatTime = formatTime;

// App root + top nav + tweaks panel.

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "theme": "dark",
  "accent": "#ff7a59",
  "density": "comfy",
  "leftWidth": 280,
  "rightWidth": 320,
  "tagChipSize": "md",
  "showFilmstrip": true,
  "showKeyboardHints": true
}/*EDITMODE-END*/;

const ACCENT_OPTIONS = [
  '#ff7a59', '#7c5cff', '#3ddc97', '#5ab9ff', '#ffd166', '#ff5d8f',
];

function TopNav({ screen, onPick, onOpenPalette, onToggleTheme, onOpenSettings, theme, immichHost }) {
  const { state } = useStore();
  return (
    <header className="topnav">
      <div className="brand">
        <span className="mark"></span>
        <span>Taggich</span>
        <small>IMMICH</small>
      </div>
      <div className="tabs">
        <button className="tab" aria-current={screen === 'home'} onClick={() => onPick('home')}>
          <Icon name="album" size={13} /> Albums <span className="count">{state.albums.length}</span>
        </button>
        <button className="tab" aria-current={screen === 'tagger'} onClick={() => onPick('tagger')}>
          <Icon name="tag" size={13} /> Tagger
        </button>
        <button className="tab" aria-current={screen === 'tagmgr'} onClick={() => onPick('tagmgr')}>
          <Icon name="sliders" size={13} /> Tags <span className="count">{state.tags.length}</span>
        </button>
      </div>
      <div className="spacer"></div>
      <button className="btn sm ghost" onClick={onOpenPalette}
              style={{height: 28, padding: '0 10px', color: 'var(--ink-3)', background: 'var(--bg-2)', border: '1px solid var(--border)'}}>
        <Icon name="search" size={13} />
        <span style={{minWidth: 120, textAlign: 'left'}}>Search or add tag…</span>
        <span className="kbd">⌘K</span>
      </button>
      <div className="conn">
        <span className="dot"></span>
        <span>{immichHost || 'immich'}</span>
      </div>
      <button className="iconbtn" onClick={onToggleTheme} title="Toggle theme">
        <Icon name={theme === 'dark' ? 'sun' : 'moon'} />
      </button>
      <button className="iconbtn" title="Refresh" onClick={() => window.location.reload()}><Icon name="refresh" /></button>
      <button className="iconbtn" title="Connection settings" onClick={onOpenSettings}><Icon name="sliders" /></button>
    </header>
  );
}

function Toast({ message, onDismiss }) {
  React.useEffect(() => {
    if (!message) return;
    const t = setTimeout(onDismiss, 4000);
    return () => clearTimeout(t);
  }, [message]);
  if (!message) return null;
  return (
    <div style={{
      position: 'fixed', bottom: 20, left: '50%', transform: 'translateX(-50%)',
      background: 'var(--bg-1)', border: '1px solid var(--border)', borderRadius: 8,
      padding: '10px 14px', boxShadow: '0 12px 40px rgba(0,0,0,.3)',
      color: 'var(--ink)', fontSize: 13, zIndex: 1000, cursor: 'pointer',
    }} onClick={onDismiss}>{message}</div>
  );
}

function FatalError({ message, onRetry, onReconfigure }) {
  return (
    <main style={{display: 'grid', placeItems: 'center', minHeight: 'calc(100vh - 56px)', padding: 24}}>
      <div style={{maxWidth: 460, textAlign: 'center'}}>
        <h2 style={{margin: '0 0 6px', fontSize: 17}}>Can't reach Immich</h2>
        <div style={{color: 'var(--ink-3)', fontSize: 13, marginBottom: 16}}>{message}</div>
        <div style={{display: 'flex', gap: 8, justifyContent: 'center'}}>
          <button className="btn" onClick={onRetry}><Icon name="refresh" size={13} /> Retry</button>
          <button className="btn primary" onClick={onReconfigure}><Icon name="sliders" size={13} /> Edit connection</button>
        </div>
      </div>
    </main>
  );
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const { state, actions } = useStore();
  const [screen, setScreen] = React.useState('home');
  const [albumId, setAlbumId] = React.useState(null);
  const [paletteOpen, setPaletteOpen] = React.useState(false);

  // Setup state.
  // status: 'loading' | 'unconfigured' | 'ready'
  const [setupStatus, setSetupStatus] = React.useState('loading');
  const [configuredUrl, setConfiguredUrl] = React.useState('');
  const [showSetup, setShowSetup] = React.useState(false);

  const checkConfig = React.useCallback(async () => {
    try {
      const r = await fetch('/api/config/status');
      const body = await r.json();
      if (body.configured) {
        setConfiguredUrl(body.immich_url || '');
        setSetupStatus('ready');
        return true;
      }
      setSetupStatus('unconfigured');
      return false;
    } catch (e) {
      setSetupStatus('unconfigured');
      return false;
    }
  }, []);

  React.useEffect(() => { checkConfig(); }, [checkConfig]);
  React.useEffect(() => {
    if (setupStatus === 'ready' && !state.loaded) actions.bootstrap();
  }, [setupStatus]);

  React.useEffect(() => {
    if (!albumId && state.albums.length) setAlbumId(state.albums[0].id);
  }, [state.albums.length]);

  React.useEffect(() => {
    document.documentElement.setAttribute('data-theme', t.theme);
    document.documentElement.style.setProperty('--accent', t.accent);
    document.documentElement.style.setProperty('--accent-soft', `color-mix(in oklab, ${t.accent} 18%, transparent)`);
    document.documentElement.style.setProperty('--accent-faint', `color-mix(in oklab, ${t.accent} 8%, transparent)`);
    document.documentElement.style.setProperty('--left-w', t.leftWidth + 'px');
    document.documentElement.style.setProperty('--right-w', t.rightWidth + 'px');
  }, [t.theme, t.accent, t.leftWidth, t.rightWidth]);

  const onPickAlbum = (id) => { setAlbumId(id); setScreen('tagger'); };

  const onSetupDone = async () => {
    setShowSetup(false);
    await checkConfig();
    // Force a re-bootstrap by clearing the loaded flag via reload.
    // Simpler than threading reset through the store.
    window.location.reload();
  };

  const immichHost = (() => {
    try { return configuredUrl ? new URL(configuredUrl).host : ''; } catch (_) { return ''; }
  })();

  if (setupStatus === 'loading') {
    return <main style={{display: 'grid', placeItems: 'center', minHeight: '100vh', color: 'var(--ink-3)'}}>Starting…</main>;
  }

  if (setupStatus === 'unconfigured' || showSetup) {
    return (
      <div className="app">
        <Setup initialUrl={configuredUrl} onSaved={onSetupDone} />
      </div>
    );
  }

  return (
    <div className="app">
      <TopNav screen={screen} onPick={setScreen}
              theme={t.theme}
              immichHost={immichHost}
              onToggleTheme={() => setTweak('theme', t.theme === 'dark' ? 'light' : 'dark')}
              onOpenPalette={() => setPaletteOpen(true)}
              onOpenSettings={() => setShowSetup(true)} />

      {state.loadError ? (
        <FatalError
          message={state.loadError}
          onRetry={() => window.location.reload()}
          onReconfigure={() => setShowSetup(true)} />
      ) : (
        <React.Fragment>
          {screen === 'home' && <Home onOpenAlbum={onPickAlbum} />}
          {screen === 'tagger' && (
            <Tagger albumId={albumId}
                    onPickAlbum={(id) => setAlbumId(id)}
                    onOpenTagMgr={() => setScreen('tagmgr')} />
          )}
          {screen === 'tagmgr' && <TagManager />}
        </React.Fragment>
      )}

      {screen !== 'tagger' && (
        <CommandPalette
          open={paletteOpen}
          onClose={() => setPaletteOpen(false)}
          assetTags={[]}
          onToggleTag={() => setPaletteOpen(false)}
          onCreateAndApply={async (name) => { await actions.createTag(name); }} />
      )}
      {screen !== 'tagger' && <GlobalKbdHooks onOpenPalette={() => setPaletteOpen(true)} />}

      <Toast message={state.toast} onDismiss={actions.clearToast} />

      <TweaksPanel>
        <TweakSection label="Appearance" />
        <TweakRadio label="Theme" value={t.theme}
                    options={[{value: 'dark', label: 'Dark'}, {value: 'light', label: 'Light'}]}
                    onChange={v => setTweak('theme', v)} />
        <TweakColor label="Accent" value={t.accent}
                    options={ACCENT_OPTIONS}
                    onChange={v => setTweak('accent', v)} />

        <TweakSection label="Layout" />
        <TweakSlider label="Album pane" value={t.leftWidth} min={56} max={420} unit="px"
                     onChange={v => setTweak('leftWidth', v)} />
        <TweakSlider label="Tag pane" value={t.rightWidth} min={56} max={480} unit="px"
                     onChange={v => setTweak('rightWidth', v)} />
        <TweakRadio label="Tag chip size" value={t.tagChipSize}
                    options={['sm', 'md', 'lg']}
                    onChange={v => setTweak('tagChipSize', v)} />

        <TweakSection label="Screens" />
        <TweakRadio label="Screen" value={screen}
                    options={[
                      {value: 'home', label: 'Albums'},
                      {value: 'tagger', label: 'Tagger'},
                      {value: 'tagmgr', label: 'Tags'},
                    ]}
                    onChange={v => setScreen(v)} />
      </TweaksPanel>
    </div>
  );
}

function GlobalKbdHooks({ onOpenPalette }) {
  React.useEffect(() => {
    const onKey = (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        onOpenPalette();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onOpenPalette]);
  return null;
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);

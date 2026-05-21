// Setup — first-run screen. Collects Immich URL + API key, tests them, saves.

function Setup({ initialUrl, onSaved }) {
  const [url, setUrl] = React.useState(initialUrl || '');
  const [key, setKey] = React.useState('');
  const [showKey, setShowKey] = React.useState(false);
  const [status, setStatus] = React.useState(null);   // 'testing' | 'ok' | 'err'
  const [message, setMessage] = React.useState('');
  const [server, setServer] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  const normUrl = (raw) => {
    const v = (raw || '').trim();
    if (!v) return '';
    if (/^https?:\/\//i.test(v)) return v.replace(/\/+$/, '');
    return 'http://' + v.replace(/\/+$/, '');
  };

  const test = async () => {
    const u = normUrl(url);
    if (!u || !key.trim()) {
      setStatus('err'); setMessage('Both fields are required.'); return;
    }
    setStatus('testing'); setMessage(''); setServer(null);
    try {
      const r = await fetch('/api/config/test', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({immich_url: u, immich_api_key: key.trim()}),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Connection failed');
      setStatus('ok');
      setServer(body.server || null);
      setMessage('Connected.');
    } catch (e) {
      setStatus('err');
      setMessage(e.message);
    }
  };

  const save = async () => {
    const u = normUrl(url);
    if (!u || !key.trim()) {
      setStatus('err'); setMessage('Both fields are required.'); return;
    }
    setSaving(true);
    try {
      const r = await fetch('/api/config', {
        method: 'POST',
        headers: {'Content-Type': 'application/json'},
        body: JSON.stringify({immich_url: u, immich_api_key: key.trim()}),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(body.error || 'Save failed');
      onSaved && onSaved();
    } catch (e) {
      setStatus('err');
      setMessage(e.message);
    } finally {
      setSaving(false);
    }
  };

  const stripe = status === 'ok' ? 'var(--ok, #3ddc97)'
    : status === 'err' ? 'var(--danger, #ff5d5d)'
    : status === 'testing' ? 'var(--accent)' : 'var(--border)';

  return (
    <main style={{
      display: 'grid', placeItems: 'center', padding: 24,
      minHeight: 'calc(100vh - 56px)', overflowY: 'auto',
    }}>
      <div style={{
        width: '100%', maxWidth: 520,
        background: 'var(--bg-1)', border: '1px solid var(--border)',
        borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,.25)',
        overflow: 'hidden',
      }}>
        <div style={{padding: '20px 24px', borderBottom: '1px solid var(--border)'}}>
          <div style={{display: 'flex', alignItems: 'center', gap: 10}}>
            <Icon name="tag" size={18} />
            <h2 style={{margin: 0, fontSize: 17, fontWeight: 600}}>Connect to Immich</h2>
          </div>
          <div style={{color: 'var(--ink-3)', fontSize: 13, marginTop: 6}}>
            Taggich uses your Immich server's API. Generate an API key in Immich →
            account settings → API keys, then paste it below.
          </div>
        </div>

        <div style={{padding: 24, display: 'grid', gap: 14}}>
          <label style={{display: 'grid', gap: 6}}>
            <span style={{font: '600 11px var(--font-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
              Immich URL
            </span>
            <input
              className="input"
              autoFocus
              spellCheck="false"
              autoComplete="off"
              placeholder="http://192.168.1.10:2283"
              value={url}
              onChange={e => { setUrl(e.target.value); setStatus(null); }}
              onKeyDown={e => e.key === 'Enter' && test()}
              style={{height: 36, padding: '0 12px'}} />
            <span style={{fontSize: 11.5, color: 'var(--ink-4)'}}>
              The base URL of your Immich web UI. Include the port if non-standard.
            </span>
          </label>

          <label style={{display: 'grid', gap: 6}}>
            <span style={{font: '600 11px var(--font-sans)', letterSpacing: '0.06em', textTransform: 'uppercase', color: 'var(--ink-3)'}}>
              API key
            </span>
            <div style={{position: 'relative'}}>
              <input
                className="input mono"
                type={showKey ? 'text' : 'password'}
                spellCheck="false"
                autoComplete="off"
                placeholder="Paste your Immich API key"
                value={key}
                onChange={e => { setKey(e.target.value); setStatus(null); }}
                onKeyDown={e => e.key === 'Enter' && test()}
                style={{height: 36, padding: '0 56px 0 12px', width: '100%', fontFamily: 'var(--font-mono)'}} />
              <button type="button" className="btn sm ghost"
                      onClick={() => setShowKey(s => !s)}
                      style={{position: 'absolute', right: 4, top: 4, height: 28}}>
                {showKey ? 'Hide' : 'Show'}
              </button>
            </div>
          </label>

          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '10px 12px', borderRadius: 8,
            background: 'var(--bg-2)', border: '1px solid ' + stripe,
            minHeight: 40, fontSize: 13, color: 'var(--ink-2)',
          }}>
            {status === 'testing' && <span>Testing connection…</span>}
            {status === 'ok' && (
              <span style={{display: 'inline-flex', alignItems: 'center', gap: 8}}>
                <Icon name="check" size={12} />
                Connected{server && server.version ? ` · Immich v${server.version}` : ''}
              </span>
            )}
            {status === 'err' && (
              <span style={{display: 'inline-flex', alignItems: 'center', gap: 8, color: '#ff8a8a'}}>
                <Icon name="x" size={12} /> {message}
              </span>
            )}
            {!status && <span style={{color: 'var(--ink-4)'}}>Idle. Hit "Test" once you've filled in both fields.</span>}
          </div>

          <div style={{display: 'flex', gap: 8, justifyContent: 'flex-end'}}>
            <button className="btn ghost" onClick={test} disabled={status === 'testing' || saving}>
              <Icon name="refresh" size={13} /> Test
            </button>
            <button className="btn primary" onClick={save} disabled={saving}>
              {saving ? 'Saving…' : (<React.Fragment><Icon name="check" size={13} /> Save & continue</React.Fragment>)}
            </button>
          </div>
        </div>

        <div style={{padding: '12px 24px', background: 'var(--bg-2)', borderTop: '1px solid var(--border)', fontSize: 11.5, color: 'var(--ink-4)', lineHeight: 1.55}}>
          Your credentials are written to <span className="mono">/data/config.json</span> inside the container.
          On TrueNAS Scale, that path is backed by the host dataset you mounted so it survives restarts.
        </div>
      </div>
    </main>
  );
}

window.Setup = Setup;

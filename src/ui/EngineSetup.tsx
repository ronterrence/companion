import { useState } from 'react';
import { ProviderSetup } from './ProviderSetup';
import { ProviderActivity } from './ProviderChatControls';
import { configureEngine, engineError, getEngineStatus, modelAction, removeApiKey, selectEngine, testApi, type EngineStatus } from '../services/engine';

export function EngineSetup({ status, onChange, onboarding = false }: { status: EngineStatus; onChange: (status: EngineStatus) => void; onboarding?: boolean }) {
  const [baseUrl, setBaseUrl] = useState(status.baseUrl ?? '');
  const [model, setModel] = useState(status.model ?? '');
  const [key, setKey] = useState('');
  const [message, setMessage] = useState('');
  const [working, setWorking] = useState(false);
  const [showApi, setShowApi] = useState(status.engine === 'api');
  const [confirmRemove, setConfirmRemove] = useState(false);
  const downloading = ['downloading', 'verifying'].includes(status.local.state);
  const run = async (action: () => Promise<void>, success = '') => {
    setWorking(true); setMessage('');
    try { await action(); onChange(await getEngineStatus()); setMessage(success); }
    catch (error) { setMessage(engineError(error)); }
    finally { setWorking(false); }
  };
  return <section className="engine-setup" aria-label="AI engine setup">
    <div className="eyebrow">Your computer. Your choice.</div>
    <h1>{onboarding ? 'How would you like to run your AI?' : 'AI engine'}</h1>
    <p>No Companion Studio account needed. Choose a local model or connect a provider you pay directly.</p>
    <div className="grid two">
      <div className="card"><span className="badge local">On your computer</span><h2>Download a local model</h2>
        <p>Qwen3 0.6B is a small, basic model for simple conversations. It can make mistakes and is less capable than larger models.</p>
        <p>429 MB download · 4 GB RAM minimum · 8 GB recommended · CPU only.</p>
        <p>After setup, chats run offline. Downloading contacts Hugging Face; your conversations stay on this computer.</p>
        <details><summary>Model and license</summary><p>{status.catalog.name} · {status.catalog.license}<br />{status.catalog.runtime}</p><p>Revision: <code>{status.catalog.revision}</code></p><p>License: {status.catalog.licenseUrl}</p></details>
        <p role="status">Local model: <strong>{status.local.state}</strong></p>
        {(downloading || status.local.state === 'paused') && <div><progress aria-label="Model download" value={status.local.downloaded} max={status.local.total} /><p>{Math.round(status.local.downloaded / 1_000_000)} / {Math.round(status.local.total / 1_000_000)} MB</p></div>}
        {status.local.error && <p className="safety-notice">{status.local.error}</p>}
        <div className="actions">
          {!status.local.installed && !downloading && <button className="primary-btn" disabled={working} onClick={() => void run(async () => { await modelAction('download'); }, 'Model installed. Choose “Use local model” to continue.')}>{status.local.downloaded ? 'Resume download' : 'Download model'}</button>}
          {downloading && status.local.state === 'downloading' && <button className="secondary-btn" onClick={() => void modelAction('cancel').then(() => setMessage('Pausing download…')).catch((e) => setMessage(engineError(e)))}>Pause download</button>}
          {status.local.installed && <button className="primary-btn" disabled={working || downloading} onClick={() => void run(async () => { await modelAction('start'); await selectEngine('local'); }, 'Local model ready.')}>Use local model</button>}
          {status.local.state === 'ready' && <button className="secondary-btn" disabled={working} onClick={() => void run(() => modelAction('stop'), 'Model stopped. It will start when you next send a local message.')}>Stop model</button>}
          {(status.local.installed || status.local.downloaded > 0) && !downloading && <button className="ghost-btn" disabled={working} onClick={() => setConfirmRemove(true)}>Remove model</button>}
        </div>
        {confirmRemove && <div className="safety-notice"><p>Remove the model download from this computer? Conversations are kept.</p><button className="danger-btn" disabled={working} onClick={() => void run(async () => { await modelAction('remove'); setConfirmRemove(false); })}>Confirm removal</button><button className="ghost-btn" onClick={() => setConfirmRemove(false)}>Keep model</button></div>}
      </div>
      {status.profiles ? <ProviderSetup status={status} onChange={onChange} /> : <div className="card"><span className="badge">Your provider account</span><h2>Connect an API provider</h2>
        <p>Use an OpenAI-compatible Chat Completions provider. Your provider receives the conversation when you authorize it and bills your account.</p>
        <p>Your key is stored in Windows Credential Manager. Companion Studio does not operate an AI relay.</p>
        {!showApi && <button className="secondary-btn" onClick={() => setShowApi(true)}>Connect an API provider</button>}
        {showApi && <form onSubmit={(event) => { event.preventDefault(); const secret = key; setKey(''); void run(() => configureEngine(baseUrl, model, secret), 'Connection saved. You can now test it.'); }}>
          <label htmlFor="api-base-url">API base URL</label><input id="api-base-url" type="url" required placeholder="https://your-provider.example/v1" value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
          <label htmlFor="api-model">Model identifier</label><input id="api-model" required placeholder="Model name from your provider" value={model} onChange={(e) => setModel(e.target.value)} />
          <label htmlFor="api-key">API key</label><input id="api-key" type="password" autoComplete="off" spellCheck={false} required value={key} onChange={(e) => setKey(e.target.value)} />
          <button className="primary-btn section-gap" disabled={working} type="submit">Save API connection</button>
        </form>}
        {status.hasKey && <div className="section-gap"><p>Saved connection: {status.baseUrl} · {status.model}. Key stored securely.</p><p>Testing sends a short “Reply with OK” prompt and may incur a small provider charge.</p><div className="actions"><button className="secondary-btn" disabled={working} onClick={() => void run(testApi, 'Connection test succeeded.')}>Test connection (may cost)</button><button className="primary-btn" disabled={working} onClick={() => void run(() => selectEngine('api'), 'API provider selected.')}>Use API provider</button><button className="danger-btn" disabled={working} onClick={() => void run(removeApiKey, 'API key removed.')}>Remove API key</button></div></div>}
      </div>}
    </div>
    {status.profiles && <ProviderActivity />}
    {message && <p className="safety-notice" role="alert">{message}</p>}
    <button className="ghost-btn section-gap" disabled={working} onClick={() => void run(() => selectEngine('prototype'))}>{onboarding ? 'Skip for now' : 'Use prototype replies'}</button>
    <p className="muted">Prototype mode uses example replies, not a connected AI model.</p>
  </section>;
}

import { useState } from 'react';
import { chooseProviderProfile, defaultPreferences, deleteProviderProfile, discoverProviderModels, engineError, getEngineStatus, runProviderRequest, saveProviderProfile, type EngineStatus, type ProviderKind, type ProviderProfile } from '../services/engine';

const providerNames: Record<ProviderKind, string> = { openai: 'OpenAI', anthropic: 'Anthropic Claude', deepseek: 'DeepSeek', custom: 'Custom OpenAI-compatible' };
export function ProviderSetup({ status, onChange }: { status: EngineStatus; onChange: (s: EngineStatus) => void }) {
  const [editing, setEditing] = useState<ProviderProfile | null>(null);
  const [provider, setProvider] = useState<ProviderKind>('openai');
  const [name, setName] = useState(''); const [model, setModel] = useState('');
  const [baseUrl, setBaseUrl] = useState(''); const [key, setKey] = useState('');
  const [context, setContext] = useState(32768); const [output, setOutput] = useState(8192);
  const [advanced, setAdvanced] = useState(false); const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false); const [notice, setNotice] = useState('');
  const [available, setAvailable] = useState<string[]>([]); const [deleting, setDeleting] = useState<string | null>(null);
  const models = (status.models ?? []).filter(m => m.provider === provider);
  const known = models.find(m => m.id === model);
  const run = async (action: () => Promise<void>) => { setBusy(true); setNotice(''); try { await action(); onChange(await getEngineStatus()); } catch (e) { setNotice(engineError(e)); } finally { setBusy(false); } };
  const edit = (p: ProviderProfile | null) => { setEditing(p); setProvider(p?.provider ?? 'openai'); setName(p?.name ?? ''); setModel(p?.model ?? ''); setBaseUrl(p?.baseUrl ?? ''); setKey(''); setContext(p?.limits?.context ?? 32768); setOutput(p?.limits?.output ?? 8192); setAdvanced(!!p?.limits); setApproved(!!p?.limits); setAvailable([]); setNotice(''); };
  return <div className="card provider-setup"><span className="badge">Your provider accounts</span><h2>Connect an API provider</h2>
    <p>Choose a provider and model. Requests go directly to your provider when you authorize them; your provider bills your account. Keys stay in your operating system’s secure credential store.</p>
    <ul className="connection-list">{(status.profiles ?? []).map(p => <li key={p.id}>
      <strong>{p.name}</strong> · {providerNames[p.provider]} · {p.model}
      <p className="muted">{p.id === status.selectedProfile ? 'Selected connection. ' : ''}{p.testedAt ? `Last short connection test: ${new Date(p.testedAt).toLocaleString()}. This does not verify every chat feature.` : 'Not tested with your account.'}</p>
      <div className="actions">
        <button className="secondary-btn" disabled={busy} onClick={() => edit(p)}>Edit {p.name}</button>
        <button className="primary-btn" disabled={busy} onClick={() => void run(async () => { await chooseProviderProfile(p.id); setNotice('Provider selected. Authorize processing again when you return to chat.'); })}>Use {p.name}</button>
        <button className="secondary-btn" disabled={busy} onClick={() => void run(async () => { const result = await runProviderRequest({ id: crypto.randomUUID(), sessionId: '', action: 'test', profileId: p.id, expectedModel: p.model, preferences: defaultPreferences }); setNotice(result.reply.status === 'complete' ? `Connection test succeeded for ${p.model} with Standard / Balanced settings. See activity for usage.` : result.reply.message ?? 'Connection test failed.'); })}>Test {p.name} (may cost)</button>
        <button className="danger-btn" disabled={busy} onClick={() => setDeleting(p.id)}>Delete {p.name}</button>
      </div>
      {deleting === p.id && <div role="alert"><p>Delete this connection and its stored key? Conversations remain on this computer.</p><button disabled={busy} onClick={() => void run(async () => { await deleteProviderProfile(p.id); setDeleting(null); if (editing?.id === p.id) edit(null); })}>Confirm deletion</button><button onClick={() => setDeleting(null)}>Keep connection</button></div>}
    </li>)}</ul>
    <form onSubmit={e => { e.preventDefault(); if (!known && !approved) { setNotice('Confirm the documented limits for this unverified model.'); return; } const secret = key; setKey(''); void run(async () => { await saveProviderProfile({ id: editing?.id, name, provider, baseUrl, model, key: secret || undefined, limits: known ? null : { context, output } }); edit(null); setNotice('Connection saved. Select it with Use, or run a test when ready.'); }); }}>
      <h3>{editing ? 'Edit connection' : 'Add connection'}</h3>
      <label htmlFor="provider-kind">Provider</label><select id="provider-kind" disabled={busy || !!editing} value={provider} onChange={e => { setProvider(e.target.value as ProviderKind); setModel(''); setAvailable([]); setApproved(false); }}>{Object.entries(providerNames).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
      <label htmlFor="connection-name">Connection name</label><input id="connection-name" required maxLength={100} value={name} onChange={e => setName(e.target.value)} placeholder="My provider account" />
      {provider === 'custom' && <><label htmlFor="api-base-url">API base URL</label><input id="api-base-url" type="url" required value={baseUrl} onChange={e => setBaseUrl(e.target.value)} placeholder="https://your-provider.example/v1" /><p className="muted">Changing this address requires re-entering the key.</p></>}
      <label htmlFor="api-key">API key{editing ? ' (leave blank to keep stored key)' : ''}</label><input id="api-key" type="password" autoComplete="off" spellCheck={false} required={!editing} value={key} onChange={e => setKey(e.target.value)} />
      <label htmlFor="api-model">Model identifier</label><input id="api-model" list="provider-models" required value={model} onChange={e => { setModel(e.target.value); setApproved(false); }} placeholder="Choose a model or enter its identifier" />
      <datalist id="provider-models">{[...new Set([...models.map(m => m.id), ...available])].map(id => <option key={id} value={id}>{models.some(m => m.id === id) ? 'Documented configuration' : 'Account model; unverified configuration'}</option>)}</datalist>
      {known && <p className="muted">{known.qualification}. Context: {known.limits.context.toLocaleString()} tokens. Availability depends on your account.</p>}
      {editing && <button type="button" disabled={busy} onClick={() => void run(async () => { setAvailable(await discoverProviderModels(editing.id)); setNotice('Account model list loaded. Availability does not establish compatibility.'); })}>Load account models</button>}
      {!editing && <p className="muted">Save a connection first to load its account model list. Documented configurations are listed above.</p>}
      {!known && model && <><button type="button" className="ghost-btn" onClick={() => setAdvanced(!advanced)}>Advanced settings for unverified model</button>{advanced && <fieldset><legend>Model limits from provider documentation</legend><label htmlFor="context-limit">Context tokens</label><input id="context-limit" type="number" min={4096} max={2000000} value={context} onChange={e => { setContext(Number(e.target.value)); setApproved(false); }} /><label htmlFor="output-limit">Maximum output tokens</label><input id="output-limit" type="number" min={1024} max={128000} value={output} onChange={e => { setOutput(Number(e.target.value)); setApproved(false); }} /><p>Thinking controls are unavailable for unverified models. Providers may apply their own defaults.</p><label className="consent-row"><input type="checkbox" checked={approved} onChange={e => setApproved(e.target.checked)} />I checked these limits in the provider’s documentation.</label></fieldset>}</>}
      <div className="actions section-gap"><button className="primary-btn" disabled={busy} type="submit">Save API connection</button>{editing && <button type="button" disabled={busy} onClick={() => edit(null)}>Add another connection</button>}</div>
    </form>
    <p className="muted">Tests send a short prompt and may cost money. They never run automatically.</p>
    {notice && <p role="alert" className="safety-notice">{notice}</p>}
  </div>;
}

import { useEffect, useState } from 'react';
import { assessChatContext, chooseProviderProfile, engineError, getEngineStatus, providerActivity, saveProviderProfile, type ContextAssessment, type EngineStatus, type Preferences, type ProviderActivityEntry } from '../services/engine';

export function ProviderChatControls({ engine, sessionId, preferences, onPreferences, onChange, busy, draft, revision, onSummarize, onNewChat }: { engine: EngineStatus; sessionId: string; preferences: Preferences; onPreferences: (v: Preferences) => void; onChange: (v: EngineStatus) => void; busy: boolean; draft: string; revision: number; onSummarize: () => void; onNewChat: () => void }) {
  const [assessment, setAssessment] = useState<ContextAssessment | null>(null); const [error, setError] = useState(''); const [switching, setSwitching] = useState(false); const [confirmSummary, setConfirmSummary] = useState(false);
  const profile = engine.profiles?.find(p => p.id === engine.selectedProfile);
  const spec = engine.models?.find(m => m.provider === profile?.provider && m.id === profile.model);
  useEffect(() => { let live = true; const timer = window.setTimeout(() => { void assessChatContext(sessionId, preferences, draft).then(v => { if (live) { setAssessment(v); setError(''); } }).catch(e => { if (live) setError(engineError(e)); }); }, 350); return () => { live = false; clearTimeout(timer); }; }, [sessionId, preferences, draft, revision, engine.selectedProfile, engine.model]);
  const change = async (action: () => Promise<void>) => { setSwitching(true); setError(''); try { await action(); onChange(await getEngineStatus()); } catch (e) { setError(engineError(e)); } finally { setSwitching(false); } };
  return <div className="provider-controls">
    <fieldset disabled={busy || switching}><legend>Chat settings</legend><div className="grid two">
      <div><label htmlFor="chat-provider">Provider connection</label><select id="chat-provider" value={engine.selectedProfile ?? ''} onChange={e => void change(() => chooseProviderProfile(e.target.value))}>{engine.profiles?.map(p => <option value={p.id} key={p.id}>{p.name}</option>)}</select></div>
      <div><label htmlFor="chat-model">Model</label><select id="chat-model" value={profile?.model ?? ''} onChange={e => { const model = e.target.value; if (profile) void change(async () => { await saveProviderProfile({ ...profile, model, limits: null }); await chooseProviderProfile(profile.id); }); }}>{[...new Set([profile?.model ?? '', ...(engine.models ?? []).filter(m => m.provider === profile?.provider).map(m => m.id)])].filter(Boolean).map(m => <option key={m}>{m}</option>)}</select></div>
      <div><label htmlFor="answer-length">Answer length</label><select id="answer-length" value={preferences.length} onChange={e => onPreferences({ ...preferences, length: e.target.value as Preferences['length'] })}><option value="brief">Brief</option><option value="standard">Standard</option><option value="detailed">Detailed</option></select></div>
      {spec && spec.thinking !== 'none' && <div><label htmlFor="thinking-effort">Thinking</label><select id="thinking-effort" value={preferences.thinking} onChange={e => onPreferences({ ...preferences, thinking: e.target.value as Preferences['thinking'] })}><option value="quick">Quick</option><option value="balanced">Balanced</option><option value="deep">Deep</option></select></div>}
    </div></fieldset>
    <p className="muted">Changing provider or model requires renewed permission to send the included conversation history. Deeper thinking and longer answers may cost more.</p>
    {assessment?.summarized && <p>Earlier messages are represented by a summary. The full transcript remains stored locally.</p>}
    {assessment?.nearLimit && <p role="status">{assessment.overLimit ? 'This conversation is too large to send.' : 'This conversation is approaching the model’s context allowance.'} Summarize older messages or start a new chat. Context estimates are conservative.</p>}
    <button className="secondary-btn" disabled={busy || switching || revision < 4} onClick={() => setConfirmSummary(true)}>Summarize older messages</button>
    <button className="ghost-btn" disabled={busy || switching} onClick={onNewChat}>Start new chat</button>
    {confirmSummary && <div className="safety-notice"><p>This sends older conversation context to {profile?.name} for a paid summary. Your original transcript remains on this computer. It does not create companion memory.</p><button disabled={busy} onClick={() => { setConfirmSummary(false); onSummarize(); }}>Summarize now (may cost)</button><button onClick={() => setConfirmSummary(false)}>Keep full context</button></div>}
    {error && <p role="alert">{error}</p>}
  </div>;
}

export function ProviderActivity() {
  const [records, setRecords] = useState<ProviderActivityEntry[]>([]); const [error, setError] = useState('');
  const refresh = () => void providerActivity().then(setRecords).catch(e => setError(engineError(e)));
  useEffect(refresh, []);
  const known = records.filter(r => r.reply.usage.estimatedUsd !== null);
  return <section className="card section-gap"><h2>Provider activity on this computer</h2><p>Tests, chats, retries, continuations, and summaries are included. Estimates are not your provider’s bill and exclude activity from other apps.</p>
    <p>Known estimated cost: ${known.reduce((sum, r) => sum + (r.reply.usage.estimatedUsd ?? 0), 0).toFixed(4)} USD. {records.length - known.length} request(s) have unknown cost.</p>
    <button className="secondary-btn" onClick={refresh}>Refresh activity</button>{error && <p role="alert">{error}</p>}
    <div className="activity-table"><table><caption>Most recent 50 requests</caption><thead><tr><th>When / model</th><th>Action / result</th><th>Input / output tokens</th><th>Reasoning tokens</th><th>Estimated USD</th></tr></thead><tbody>{records.slice(-50).reverse().map(r => <tr key={r.id}><td>{new Date(r.createdAt).toLocaleString()}<br />{r.model}</td><td>{r.action} / {r.reply.status}</td><td>{r.reply.usage.input ?? 'unknown'} / {r.reply.usage.output ?? 'unknown'}</td><td>{r.reply.usage.reasoning ?? 'unknown'}</td><td>{r.reply.usage.estimatedUsd == null ? 'unknown' : `$${r.reply.usage.estimatedUsd.toFixed(5)} (${r.reply.usage.priceDate})`}</td></tr>)}</tbody></table></div>
  </section>;
}

import { useEffect, useMemo, useState } from 'react';
import { companions } from '../domain/companions';
import { goals, type Goal } from '../domain/goals';
import { evaluateInput, evaluateOutput, validateManifest } from '../domain/policy';
import type { CompanionManifest, MemoryRecord, Message, RuntimeStatus } from '../domain/types';
import { createRepository } from '../services/repository';
import { LlamaCppProvider, PrototypeProvider, type ModelProvider } from '../services/model';
import { EngineSetup } from './EngineSetup';
import { classifyRouteRequest } from '../domain/router';
import { authorizeChat, beginChat, completeChat, endChat, engineError, getEngineStatus, isDesktop, type EngineStatus } from '../services/engine';
import { decryptExport, encryptExport, type EncryptedEnvelope } from '../services/cryptoExport';

type Screen = 'home' | 'recommendations' | 'detail' | 'chat' | 'summary' | 'creator' | 'library' | 'settings';
const id = () => crypto.randomUUID();

export default function App() {
  const repository = useMemo(() => createRepository(), []);
  const [availableCompanions, setAvailableCompanions] = useState<CompanionManifest[]>(companions);
  const [screen, setScreen] = useState<Screen>('home');
  const [selectedGoal, setSelectedGoal] = useState<Goal | null>(null);
  const [companion, setCompanion] = useState(companions[0]);
  const [sessionId, setSessionId] = useState('');
  const [activeChat, setActiveChat] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [engine, setEngine] = useState<EngineStatus | null>(null);
  const [engineLoadError, setEngineLoadError] = useState('');
  const desktop = isDesktop();
  const [memoryText, setMemoryText] = useState('');
  const [memoryConsent, setMemoryConsent] = useState(false);
  const [memories, setMemories] = useState<MemoryRecord[]>([]);
  const [passphrase, setPassphrase] = useState('');
  const [transferNotice, setTransferNotice] = useState('');
  const [creatorStep, setCreatorStep] = useState(0);
  const [creatorName, setCreatorName] = useState('');
  const [creatorPurpose, setCreatorPurpose] = useState('');
  const [creatorStyle, setCreatorStyle] = useState('Structured');
  const [status, setStatus] = useState<RuntimeStatus>({
    executionMode: 'local', memoryMode: 'session', safetyPolicyVersion: companion.policyVersion,
    cloudPermission: 'none', localProviderAvailable: false,
  });

  useEffect(() => {
    if (!desktop) return;
    let mounted = true;
    const refresh = () => void getEngineStatus().then((value) => { if (mounted) { setEngine(value); setEngineLoadError(''); } }).catch((error) => { if (mounted) setEngineLoadError(engineError(error)); });
    refresh(); const interval = window.setInterval(refresh, 1000);
    return () => { mounted = false; window.clearInterval(interval); };
  }, [desktop]);

  useEffect(() => {
    void repository.listCompanions().then((stored) => {
      const valid = stored.flatMap((item) => { try { return [validateManifest(item)]; } catch { return []; } });
      setAvailableCompanions((current) => [...current.filter((item) => !valid.some((saved) => saved.id === item.id)), ...valid]);
    });
  }, [repository]);

  function review(selected: CompanionManifest) {
    setCompanion(selected);
    setStatus((current) => ({ ...current, safetyPolicyVersion: selected.policyVersion }));
    setScreen('detail');
  }

  function chooseGoal(goal: Goal) {
    if (goal.id === 'custom') { setCreatorStep(0); setScreen('creator'); return; }
    setSelectedGoal(goal); setScreen('recommendations');
  }

  async function finishCreator() {
    try {
      const manifest = validateManifest({
        schemaVersion: '1.0', id: `custom-${id()}`, name: creatorName.trim(), purpose: creatorPurpose.trim(),
        style: [creatorStyle], minimumAge: 18, riskClass: 'limited',
        allowedCapabilities: ['guided-conversation'],
        prohibitedCapabilities: ['professional-advice', 'autonomous-decision', 'dependency-encouragement'],
        memoryPolicy: 'explicit-consent', cloudPolicy: 'ask-per-session', policyVersion: '2026.09',
        opening: `I am an AI companion. What would you like to explore about ${creatorPurpose.trim()}?`,
        reply: 'What would be the most useful next question to explore?',
      });
      await repository.saveCompanion(manifest);
      setAvailableCompanions((current) => [...current, manifest]); setCompanion(manifest); setScreen('detail'); setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Companion could not be created'); }
  }

  async function startSession() {
    if (busy) return;
    setBusy(true);
    try {
    if (desktop && sessionId) await endChat(sessionId);
    const nextSessionId = id();
    const opening: Message = { id: id(), sessionId: nextSessionId, role: 'assistant', content: companion.opening, createdAt: new Date().toISOString(), provider: 'prototype' };
    const localAvailable = desktop ? engine?.local.state === 'ready' : await new LlamaCppProvider().isAvailable();
    if (desktop) await beginChat(nextSessionId, companion);
    await repository.saveSession({ id: nextSessionId, companionId: companion.id, createdAt: new Date().toISOString(), executionMode: engine?.engine === 'api' ? 'cloud' : 'local', memoryMode: 'session' });
    await repository.saveMessage(opening);
    setSessionId(nextSessionId); setActiveChat(true); setMessages([opening]); setInput(''); setNotice(''); setStatus((current) => ({ ...current, executionMode: engine?.engine === 'api' ? 'cloud' : 'local', cloudPermission: 'none', localProviderAvailable: localAvailable })); setScreen('chat');
    } catch (error) { setNotice(engineError(error)); }
    finally { setBusy(false); }
  }

  async function sendMessage() {
    const content = input.trim();
    if (!content || busy) return;
    if (desktop && engine?.engine === 'api' && [companion.purpose, ...companion.style, ...messages.map((m) => m.content), content].some((text) => classifyRouteRequest(text).containsSensitiveData)) {
      setNotice('Conversation contains potentially sensitive information. Nothing was sent. Switch to a local model in Settings, or start a new chat without that information.'); return;
    }
    if (desktop && engine?.engine === 'api' && status.cloudPermission === 'none') { setNotice('Review and authorize API processing below before sending.'); return; }
    const decision = evaluateInput(content);
    if (decision.action === 'block') { setNotice(decision.reason ?? 'Request blocked'); return; }
    if (decision.action === 'support') {
      setNotice('You may be in immediate danger. Contact local emergency services or a trusted person now. This AI is not crisis care.');
    } else setNotice('');
    const userMessage: Message = { id: id(), sessionId, role: 'user', content, createdAt: new Date().toISOString(), provider: 'prototype' };
    setBusy(true);
    const nextMessages = [...messages, userMessage];
    const provider: ModelProvider = status.localProviderAvailable ? new LlamaCppProvider() : new PrototypeProvider();
    try {
      const result = desktop ? await completeChat(sessionId, nextMessages) : { content: await provider.complete(companion, nextMessages), provider: provider.id, blocked: false };
      const generatedContent = result.content;
      const outputDecision = evaluateOutput(generatedContent);
      const contentOut = outputDecision.action === 'block'
        ? 'I cannot provide that response because it conflicts with this companion’s safety boundaries.'
        : generatedContent;
      if (outputDecision.action === 'block' || result.blocked) {
        await repository.appendAudit({ id: id(), type: 'safety.output.blocked', createdAt: new Date().toISOString(), policyVersion: companion.policyVersion, metadata: { companionId: companion.id, reason: outputDecision.reason ?? 'policy' } });
      }
      if (result.provider === 'cloud') {
        await repository.appendAudit({ id: id(), type: 'cloud.request.completed', createdAt: new Date().toISOString(), policyVersion: companion.policyVersion, metadata: { companionId: companion.id, scope: status.cloudPermission, endpointOrigin: new URL(engine!.baseUrl!).origin } });
        setStatus((current) => ({ ...current, executionMode: 'cloud' }));
      } else {
        setStatus((current) => ({ ...current, executionMode: 'local' }));
      }
      const response: Message = { id: id(), sessionId, role: 'assistant', content: contentOut, createdAt: new Date().toISOString(), provider: result.provider };
      await repository.saveMessage(userMessage); await repository.saveMessage(response); setInput(''); setMessages([...nextMessages, response]);
    } catch (error) { setNotice(engineError(error)); }
    finally { setBusy(false); if (desktop && engine?.engine === 'api' && companion.cloudPolicy === 'ask-every-time') setStatus((current) => ({ ...current, cloudPermission: 'none' })); }
  }

  async function finishSession() {
    try {
    if (desktop) await endChat(sessionId);
    setActiveChat(false);
    setStatus((current) => ({ ...current, cloudPermission: 'none' })); setScreen('summary');
    } catch (error) { setNotice(engineError(error)); }
  }

  function engineChanged(value: EngineStatus) {
    setEngine(value); setStatus((current) => ({ ...current, executionMode: value.engine === 'api' ? 'cloud' : 'local', cloudPermission: 'none', localProviderAvailable: value.local.state === 'ready' }));
  }

  async function openSettings() {
    setMemories(await repository.listMemories(companion.id));
    setScreen('settings');
  }

  async function remember() {
    const content = memoryText.trim();
    if (!content) return;
    const memory: MemoryRecord = { id: id(), companionId: companion.id, content, purpose: 'User-requested companion personalisation', sourceSessionId: sessionId || 'manual-settings', consentedAt: new Date().toISOString() };
    try {
      await repository.saveMemory(memory, memoryConsent);
      await repository.appendAudit({ id: id(), type: 'memory.created', createdAt: new Date().toISOString(), policyVersion: companion.policyVersion, metadata: { companionId: companion.id, consent: true } });
      setMemories(await repository.listMemories(companion.id));
      setStatus((current) => ({ ...current, memoryMode: 'consented' }));
      setMemoryText(''); setMemoryConsent(false); setNotice('');
    } catch (error) { setNotice(error instanceof Error ? error.message : 'Memory was not saved'); }
  }

  async function forget(memoryId: string) {
    await repository.deleteMemory(memoryId);
    await repository.appendAudit({ id: id(), type: 'memory.deleted', createdAt: new Date().toISOString(), policyVersion: companion.policyVersion, metadata: { companionId: companion.id } });
    const remaining = await repository.listMemories(companion.id);
    setMemories(remaining);
    setStatus((current) => ({ ...current, memoryMode: remaining.length ? 'consented' : 'session' }));
  }

  async function toggleCloudPermission() {
    const permission = status.cloudPermission === 'none' ? desktop && companion.cloudPolicy === 'ask-per-session' ? 'session' : 'once' : 'none';
    if (desktop) { try { await authorizeChat(sessionId, permission !== 'none'); } catch (error) { setNotice(engineError(error)); return; } }
    setStatus((current) => ({ ...current, cloudPermission: permission }));
    await repository.appendAudit({ id: id(), type: permission !== 'none' ? 'cloud.permission.granted' : 'cloud.permission.revoked', createdAt: new Date().toISOString(), policyVersion: companion.policyVersion, metadata: { scope: permission } });
  }

  async function exportSelectedCompanion() {
    try {
      const envelope = await encryptExport({ kind: 'companion-manifest', manifest: companion }, passphrase);
      const blob = new Blob([JSON.stringify(envelope, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob); const link = document.createElement('a');
      link.href = url; link.download = `${companion.id}.companion.encrypted.json`; link.click(); URL.revokeObjectURL(url);
      setTransferNotice('Encrypted export created. Keep the passphrase separately.');
    } catch (error) { setTransferNotice(error instanceof Error ? error.message : 'Export failed'); }
  }

  async function importCompanion(file: File) {
    try {
      const envelope = JSON.parse(await file.text()) as EncryptedEnvelope;
      const payload = await decryptExport<{ kind: string; manifest: unknown }>(envelope, passphrase);
      if (payload.kind !== 'companion-manifest') throw new Error('Unsupported import content');
      const manifest = validateManifest(payload.manifest);
      await repository.saveCompanion(manifest);
      setAvailableCompanions((current) => [...current.filter((item) => item.id !== manifest.id), manifest]);
      setTransferNotice(`${manifest.name} imported and safety-validated.`);
    } catch { setTransferNotice('Import rejected: wrong passphrase, tampered file, or unsafe manifest.'); }
  }

  if (desktop && !engine) return <div className="app"><main><h1>Companion Studio</h1><p role="status">{engineLoadError || 'Loading your AI settings…'}</p></main></div>;
  if (desktop && engine && !engine.setupComplete) return <div className="app"><main><EngineSetup status={engine} onChange={engineChanged} onboarding /></main></div>;

  return <div className="app">
    <header>
      <button className="brand brand-button" disabled={busy} onClick={() => setScreen('home')}><span className="brand-mark">CS</span><span>Companion Studio</span></button>
      <nav aria-label="Primary navigation">
        <button disabled={busy} className={`nav-btn ${screen === 'home' ? 'active' : ''}`} onClick={() => setScreen('home')}>Home</button>
        <button disabled={busy} className={`nav-btn ${screen === 'library' ? 'active' : ''}`} onClick={() => setScreen('library')}>My Companions</button>
        <button disabled={busy} className={`nav-btn ${screen === 'settings' ? 'active' : ''}`} onClick={() => void openSettings()}>Settings</button>
      </nav>
    </header>
    <div className="ai-disclosure" role="status">You are using an AI system. Companions are not human or professional advisers.</div>
    <div className="status-strip" aria-label="Runtime status">
      <span className="badge local">● {desktop ? engine?.engine === 'api' ? 'API mode' : engine?.engine === 'local' ? 'Local mode' : 'Prototype mode' : status.executionMode === 'local' ? 'Local mode' : 'Cloud mode'}</span>
      <span className="badge memory">{status.memoryMode === 'session' ? 'Session memory' : 'Consented memory'}</span>
      <span className="badge safety">Safety policy {status.safetyPolicyVersion}</span>
      <span className="badge">Cloud permission: {status.cloudPermission}</span>
    </div>
    <main>
      {screen === 'home' && <section className="screen active">
        <div className="hero"><div className="eyebrow">Private · Portable · Guardrailed</div><h1>Create AI companions you can trust.</h1><p>Choose what you need. Review the companion's boundaries before starting.</p></div>
        <h2>What do you need help with today?</h2>
        <div className="goal-grid">{goals.map((goal) => <button className="card click-card goal-card text-left" key={goal.id} onClick={() => chooseGoal(goal)}><span><h3>{goal.title}</h3><p>{goal.description}</p></span><span>→</span></button>)}</div>
      </section>}
      {screen === 'recommendations' && selectedGoal && <section className="screen active"><button className="ghost-btn" onClick={() => setScreen('home')}>← Back</button><div className="toolbar"><div><h2>{selectedGoal.title}</h2><p>Review the purpose and boundaries before starting.</p></div></div><div className="grid">{selectedGoal.companionIds.map((companionId) => availableCompanions.find((item) => item.id === companionId)).filter((item): item is CompanionManifest => Boolean(item)).map((item) => <div className="card companion-card" key={item.id}><div><h3>{item.name}</h3><p>{item.purpose}</p><div className="status-strip status-strip-inline"><span className="badge">{item.style[0]}</span><span className="badge memory">Consent memory</span><span className="badge safety">Safety {item.policyVersion}</span><span className="badge local">Local first</span></div></div><button className="primary-btn" onClick={() => review(item)}>Review &amp; Start</button></div>)}</div><button className="secondary-btn section-gap" onClick={() => { setCreatorStep(0); setScreen('creator'); }}>Create my own companion</button></section>}
      {screen === 'detail' && <section className="screen active">
        <button className="ghost-btn" onClick={() => setScreen('home')}>← Back</button>
        <div className="toolbar"><div><h2>{companion.name}</h2><p>{companion.purpose}</p></div><button className="primary-btn" disabled={busy} onClick={startSession}>Start session</button></div>
        <p><strong>Style:</strong> {companion.style.join(' · ')}</p>
        <div className="boundary-grid section-gap"><div className="card"><h3>This companion can</h3><ul>{companion.allowedCapabilities.map((value) => <li key={value}>{value}</li>)}</ul></div><div className="card"><h3>This companion cannot</h3><ul>{companion.prohibitedCapabilities.map((value) => <li key={value}>{value}</li>)}</ul></div></div>
      </section>}
      {screen === 'chat' && <section className="screen active"><div className="card chat-window">
        <div className="chat-header"><div><h2>{companion.name}</h2><small>{desktop ? engine?.engine === 'api' ? `API provider: ${engine.model}` : engine?.engine === 'local' ? `Local model: ${engine.local.state}` : 'Prototype fallback - no model connected' : status.localProviderAvailable ? 'Local model connected' : 'Prototype fallback — no model connected'}</small></div><button className="ghost-btn" disabled={busy} onClick={() => void finishSession()}>End session</button></div>
        <div className="messages" aria-live="polite">{messages.map((message) => <div className={`message ${message.role === 'assistant' ? 'ai' : 'user'}`} key={message.id}>{message.role === 'assistant' && <strong>{companion.name} · AI<br /></strong>}{message.content}</div>)}</div>
        {notice && <div className="safety-notice" role="alert">{notice}</div>}
        {desktop && engine?.engine === 'api' && <div className="api-consent card">
          <h3>API processing permission</h3>
          <p>{engine.baseUrl} receives your companion instructions and the messages in this conversation. Your provider bills your account. Potentially sensitive conversations are blocked; detection is not a guarantee.</p>
          {companion.cloudPolicy === 'disabled' ? <p>This companion allows local processing only. Select a local model in Settings.</p> : <><p>{companion.cloudPolicy === 'ask-every-time' ? 'This companion requires permission for each request.' : 'Permission lasts for this chat and expires on restart, connection change, or revocation.'} Already sent requests cannot be recalled.</p><button className="secondary-btn" disabled={busy} onClick={() => void toggleCloudPermission()}>{status.cloudPermission === 'none' ? companion.cloudPolicy === 'ask-every-time' ? 'Allow next request' : 'Allow API for this chat' : 'Revoke API permission'}</button></>}
        </div>}
        <div className="composer"><label className="sr-only" htmlFor="chat-input">Message</label><textarea id="chat-input" value={input} onChange={(event) => setInput(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); void sendMessage(); } }} /><button className="primary-btn" disabled={busy} onClick={() => void sendMessage()}>{busy ? 'Thinking…' : 'Send'}</button></div>
      </div></section>}
      {screen === 'summary' && <section className="screen active"><h2>Session summary</h2><div className="grid two"><div className="card"><h3>Companion</h3><p>{companion.name}</p></div><div className="card"><h3>Data handling</h3><p>{status.executionMode === 'local' ? 'Local execution' : 'Cloud execution'} · {status.memoryMode === 'session' ? 'Nothing added to durable memory' : 'Consented memory'}</p></div></div><div className="actions section-gap"><button className="primary-btn" onClick={() => setScreen('library')}>Save companion</button><button className="ghost-btn" onClick={() => setScreen('home')}>Done</button></div></section>}
      {screen === 'creator' && <section className="screen active"><button className="ghost-btn" onClick={() => setScreen('home')}>← Cancel</button><h2>Create a companion</h2><p>Step {creatorStep + 1} of 5</p>{notice && <div className="safety-notice" role="alert">{notice}</div>}
        {creatorStep === 0 && <div className="card"><label htmlFor="creator-name">Companion name</label><input id="creator-name" value={creatorName} onChange={(event) => setCreatorName(event.target.value)} /><label htmlFor="creator-purpose">What should it help with?</label><textarea id="creator-purpose" value={creatorPurpose} onChange={(event) => setCreatorPurpose(event.target.value)} /></div>}
        {creatorStep === 1 && <div className="card"><h3>How should it speak?</h3><div className="choice-row">{['Gentle', 'Structured', 'Direct', 'Curious', 'Encouraging'].map((style) => <button key={style} className={`choice ${creatorStyle === style ? 'selected' : ''}`} onClick={() => setCreatorStyle(style)}>{style}</button>)}</div></div>}
        {creatorStep === 2 && <div className="card"><h3>Safety boundaries</h3><p>Professional advice, autonomous decisions, manipulation, and emotional dependency are prohibited by default and cannot be disabled.</p></div>}
        {creatorStep === 3 && <div className="card"><h3>Memory and cloud</h3><p>Durable memory requires explicit consent for each write. API processing asks once per chat and potentially sensitive content is blocked from API requests.</p></div>}
        {creatorStep === 4 && <div className="card"><h3>Review</h3><p><strong>{creatorName || 'Unnamed companion'}</strong></p><p>{creatorPurpose || 'No purpose entered'}</p><p>{creatorStyle} · Limited risk · Adult mode</p></div>}
        <div className="actions section-gap"><button className="ghost-btn" disabled={creatorStep === 0} onClick={() => setCreatorStep((step) => Math.max(0, step - 1))}>Back</button>{creatorStep < 4 ? <button className="primary-btn" onClick={() => setCreatorStep((step) => step + 1)}>Next</button> : <button className="primary-btn" onClick={() => void finishCreator()}>Create companion</button>}</div>
      </section>}
      {screen === 'library' && <section className="screen active"><h2>My Companions</h2><p>Versioned companion manifests with explicit boundaries.</p><div className="library-list">{availableCompanions.map((item) => <div className="card library-row" key={item.id}><div><h3>{item.name}</h3><p>{item.purpose}</p><small>Risk: {item.riskClass} · Minimum age: {item.minimumAge}</small></div><button className="primary-btn" onClick={() => review(item)}>Use</button></div>)}</div></section>}
      {screen === 'settings' && activeChat && <button className="secondary-btn section-gap" onClick={() => setScreen('chat')}>Return to chat</button>}
      {screen === 'settings' && desktop && engine && <EngineSetup status={engine} onChange={engineChanged} />}
      {screen === 'settings' && <section className="screen active"><h2>Privacy and data</h2>{notice && <div className="safety-notice" role="alert">{notice}</div>}<div className="grid two">
        <div className="card"><h3>Inspectable memory · {companion.name}</h3><p>Durable memory is off by default. Each write requires confirmation.</p><label htmlFor="memory-content">Memory content</label><textarea id="memory-content" value={memoryText} onChange={(event) => setMemoryText(event.target.value)} /><label className="consent-row"><input type="checkbox" checked={memoryConsent} onChange={(event) => setMemoryConsent(event.target.checked)} /> I explicitly consent to saving this memory locally.</label><button className="secondary-btn" onClick={() => void remember()}>Save memory</button><ul className="memory-list">{memories.map((memory) => <li key={memory.id}><span>{memory.content}</span><button className="danger-btn" onClick={() => void forget(memory.id)}>Delete</button></li>)}</ul></div>
        {!desktop && <div className="card"><h3>Cloud permission</h3><p>Permission is scoped to one eligible request and is currently <strong>{status.cloudPermission}</strong>. Sensitive requests remain local.</p><button className="secondary-btn" onClick={() => void toggleCloudPermission()}>{status.cloudPermission === 'none' ? 'Allow once' : 'Revoke'}</button></div>}
        <div className="card"><h3>Encrypted portability</h3><label htmlFor="transfer-passphrase">Export/import passphrase</label><input id="transfer-passphrase" type="password" minLength={12} value={passphrase} onChange={(event) => setPassphrase(event.target.value)} /><div className="actions"><button className="secondary-btn" onClick={() => void exportSelectedCompanion()}>Export selected companion</button><label className="secondary-btn file-button">Import companion<input type="file" accept="application/json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importCompanion(file); }} /></label></div>{transferNotice && <p role="status">{transferNotice}</p>}</div>
      </div></section>}
    </main>
    <footer>Preview v0.3 · Local-first AI with enforceable boundaries</footer>
  </div>;
}

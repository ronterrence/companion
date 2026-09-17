import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as engine from '../services/engine';
import type { Message } from '../domain/types';
const fixtures = vi.hoisted(() => ({ messages: [] as Message[] }));
vi.mock('../services/repository', () => ({ createRepository: () => ({ listCompanions: async () => [], saveSession: vi.fn(), saveMessage: async (m: Message) => { fixtures.messages.push(m); }, listMessages: async () => [...fixtures.messages], appendAudit: vi.fn(), listMemories: async () => [] }) }));
vi.mock('../services/engine', async importOriginal => ({ ...await importOriginal<typeof engine>(), isDesktop: () => true, getEngineStatus: vi.fn(), beginChat: vi.fn(), authorizeChat: vi.fn(), endChat: vi.fn(), runProviderRequest: vi.fn(), cancelProviderRequest: vi.fn(), assessChatContext: vi.fn(), chooseProviderProfile: vi.fn(), getChatContext: vi.fn() }));
const profiles: engine.ProviderProfile[] = ['one', 'two'].map(id => ({ id, name: id === 'one' ? 'DeepSeek account' : 'Second account', provider: 'deepseek', baseUrl: 'https://api.deepseek.com', model: 'deepseek-flash', limits: null, testedAt: null }));
const status: engine.EngineStatus = { setupComplete: true, engine: 'api', baseUrl: profiles[0].baseUrl, model: profiles[0].model, hasKey: true, profiles, selectedProfile: 'one', models: [{ id: 'deepseek-flash', provider: 'deepseek', limits: { context: 1000000, output: 128000 }, thinking: 'deepseek', qualification: 'documented' }], local: { state: 'not-installed', downloaded: 0, total: 1, installed: false, error: null, availableRam: null }, catalog: { name: 'Local', license: 'Apache-2.0', licenseUrl: '', revision: '', size: 1, runtime: 'local' } };
const reply: engine.ProviderReply = { status: 'complete', content: 'Useful answer', message: null, usage: { input: 10, output: 20, reasoning: null, cached: null, cacheWrite: null, estimatedUsd: null, priceDate: null } };
beforeEach(() => {
  vi.clearAllMocks(); fixtures.messages = []; vi.mocked(engine.getEngineStatus).mockResolvedValue(status);
  vi.mocked(engine.cancelProviderRequest).mockResolvedValue(undefined);
  vi.mocked(engine.assessChatContext).mockResolvedValue({ estimatedInput: 200, availableInput: 900000, nearLimit: false, overLimit: false, summarized: false });
  vi.mocked(engine.runProviderRequest).mockImplementation(async request => {
    if (request.message) fixtures.messages.push(request.message);
    fixtures.messages.push({ id: `reply-${request.id}`, sessionId: request.sessionId, role: 'assistant', content: reply.content, createdAt: new Date().toISOString(), provider: 'cloud' });
    return { ...request, profileId: 'one', model: 'deepseek-flash', createdAt: new Date().toISOString(), reply };
  });
});
async function start() {
  render(<App />); await screen.findByRole('heading', { name: 'Create AI companions you can trust.' });
  fireEvent.click(screen.getByRole('button', { name: /Think through a problem/ }));
  const card = screen.getByRole('heading', { name: 'Root Cause Analyst' }).closest('.companion-card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Review & Start' }));fireEvent.click(screen.getByRole('button', { name: 'Start session' }));await screen.findByLabelText('Message');
  fireEvent.click(screen.getByRole('button', { name: 'Allow API for this chat' })); await screen.findByRole('button', { name: 'Revoke API permission' });
}
describe('provider chat lifecycle', () => {
  it('sends chosen presets and displays the persisted answer and unknown price', async () => {
    await start(); fireEvent.change(screen.getByLabelText('Answer length'), { target: { value: 'detailed' } });fireEvent.change(screen.getByLabelText('Thinking'), { target: { value: 'quick' } });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Explain this clearly' } });fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Useful answer');expect(engine.runProviderRequest).toHaveBeenCalledWith(expect.objectContaining({ preferences: { length: 'detailed', thinking: 'quick' }, action: 'send' }));expect(screen.getByText(/Estimated cost: unknown/)).toBeVisible();expect(screen.getByText(/Live web access unavailable/)).toBeVisible();
  });
  it('retains the failed message once and retries explicitly', async () => {
    vi.mocked(engine.runProviderRequest).mockImplementationOnce(async request => { fixtures.messages.push(request.message!); return { ...request, profileId: 'one', model: 'deepseek-flash', createdAt: '', reply: { ...reply, content: '', status: 'failed', message: 'Insufficient API balance.' } }; });
    await start();fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Help me study' } });fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('Insufficient API balance.');expect(screen.getByLabelText('Message')).toHaveValue('');expect(screen.getAllByText('Help me study')).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Retry unanswered message (may cost)' }));await screen.findByText('Useful answer');expect(fixtures.messages.filter(m => m.role === 'user')).toHaveLength(1);expect(engine.runProviderRequest).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'retry', message: undefined }));
  });
  it('shows Continue only for a truncated answer', async () => {
    vi.mocked(engine.runProviderRequest).mockImplementationOnce(async request => { fixtures.messages.push(request.message!, { id: 'partial', sessionId: request.sessionId, role: 'assistant', content: 'Partial answer', createdAt: '', provider: 'cloud' }); return { ...request, profileId: 'one', model: 'deepseek-flash', createdAt: '', reply: { ...reply, content: 'Partial answer', status: 'truncated' } }; });
    await start();fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Long explanation' } });fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Continue (may cost)' }));await screen.findByText('Useful answer');expect(engine.runProviderRequest).toHaveBeenLastCalledWith(expect.objectContaining({ action: 'continue' }));expect(screen.queryByRole('button', { name: 'Continue (may cost)' })).not.toBeInTheDocument();
  });
  it('allows stopping an in-flight request without sending another one', async () => {
    let finish!: (value: engine.ProviderOutcome) => void;
    vi.mocked(engine.runProviderRequest).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    await start();fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Explain' } });fireEvent.click(screen.getByRole('button', { name: 'Send' }));fireEvent.click(await screen.findByRole('button', { name: 'Stop' }));expect(engine.cancelProviderRequest).toHaveBeenCalledOnce();
    finish({ id: 'r', sessionId: '', profileId: 'one', action: 'send', model: 'deepseek-flash', createdAt: '', reply: { ...reply, status: 'cancelled', content: '', message: 'Stopped. Usage unknown.' } });await screen.findByText('Stopped. Usage unknown.');expect(engine.runProviderRequest).toHaveBeenCalledOnce();
  });
  it('revokes UI permission when switching the provider', async () => {
    await start();vi.mocked(engine.getEngineStatus).mockResolvedValue({ ...status, selectedProfile: 'two' });fireEvent.change(screen.getByLabelText('Provider connection'), { target: { value: 'two' } });
    await waitFor(() => expect(engine.chooseProviderProfile).toHaveBeenCalledWith('two'));await screen.findByRole('button', { name: 'Allow API for this chat' });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Explain' } });fireEvent.click(screen.getByRole('button', { name: 'Send' }));expect(engine.runProviderRequest).not.toHaveBeenCalled();
  });
});

import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import * as engine from '../services/engine';
vi.mock('../services/engine', () => ({ isDesktop: () => true, getEngineStatus: vi.fn(), beginChat: vi.fn(), completeChat: vi.fn(), authorizeChat: vi.fn(), endChat: vi.fn(), engineError: (e: unknown) => String(e) }));
const status: engine.EngineStatus = { setupComplete: true, engine: 'api', baseUrl: 'https://example.com/v1', model: 'test-model', hasKey: true, local: { state: 'not-installed', downloaded: 0, total: 428970080, installed: false, error: null, availableRam: null }, catalog: { name: 'Qwen3 basic', license: 'Apache-2.0', licenseUrl: 'https://example.com/license', revision: 'pinned', size: 428970080, runtime: 'llama.cpp' } };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(engine.getEngineStatus).mockResolvedValue(status); vi.mocked(engine.completeChat).mockResolvedValue({ content: 'A helpful response.', provider: 'cloud', blocked: false }); });
async function start() {
  await screen.findByRole('heading', { name: 'Create AI companions you can trust.' });
  fireEvent.click(screen.getByRole('button', { name: /Think through a problem/ }));
  const card = screen.getByRole('heading', { name: 'Root Cause Analyst' }).closest('.companion-card') as HTMLElement;
  fireEvent.click(within(card).getByRole('button', { name: 'Review & Start' }));
  fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
  await screen.findByLabelText('Message');
}
describe('desktop API chat consent', () => {
  it('requires consent, reuses it for the chat, and ends it with the session', async () => {
    render(<App />); await start();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Help me study' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(engine.completeChat).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Allow API for this chat' }));
    await screen.findByRole('button', { name: 'Revoke API permission' });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    await screen.findByText('A helpful response.');
    expect(screen.getByRole('button', { name: 'Revoke API permission' })).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'End session' }));
    await waitFor(() => expect(engine.endChat).toHaveBeenCalledOnce());
    expect(engine.authorizeChat).toHaveBeenCalledWith(expect.any(String), true);
  });
  it('blocks sensitive input before invoking inference', async () => {
    render(<App />); await start();
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'My email is me@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Nothing was sent');
    expect(engine.completeChat).not.toHaveBeenCalled();
  });
  it('keeps draft text on provider failure and does not silently fall back', async () => {
    vi.mocked(engine.completeChat).mockRejectedValueOnce('Provider usage limit reached.');
    render(<App />); await start();
    fireEvent.click(screen.getByRole('button', { name: 'Allow API for this chat' }));
    await screen.findByRole('button', { name: 'Revoke API permission' });
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Help me study' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider usage limit');
    expect(screen.getByLabelText('Message')).toHaveValue('Help me study');
    expect(screen.queryByText('A helpful response.')).not.toBeInTheDocument();
  });
});

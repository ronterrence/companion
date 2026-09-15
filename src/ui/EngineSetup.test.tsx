import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { EngineSetup } from './EngineSetup';
import * as engine from '../services/engine';
vi.mock('../services/engine', () => ({ configureEngine: vi.fn(), getEngineStatus: vi.fn(), modelAction: vi.fn(), removeApiKey: vi.fn(), selectEngine: vi.fn(), testApi: vi.fn(), engineError: (e: unknown) => String(e) }));
const status: engine.EngineStatus = { setupComplete: false, engine: 'prototype', baseUrl: null, model: null, hasKey: false, local: { state: 'not-installed', downloaded: 0, total: 428970080, installed: false, error: null, availableRam: null }, catalog: { name: 'Qwen3 basic', license: 'Apache-2.0', licenseUrl: 'https://example.com/license', revision: 'pinned', size: 428970080, runtime: 'llama.cpp' } };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(engine.getEngineStatus).mockResolvedValue(status); });
describe('desktop setup', () => {
  it('allows skipping without downloading or connecting', async () => {
    render(<EngineSetup status={status} onChange={vi.fn()} onboarding />);
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }));
    await waitFor(() => expect(engine.selectEngine).toHaveBeenCalledWith('prototype'));
    expect(engine.modelAction).not.toHaveBeenCalled(); expect(engine.configureEngine).not.toHaveBeenCalled();
  });
  it('clears API key input after handing it to the native backend', async () => {
    render(<EngineSetup status={status} onChange={vi.fn()} onboarding />);
    fireEvent.click(screen.getByRole('button', { name: 'Connect an API provider' }));
    fireEvent.change(screen.getByLabelText('API base URL'), { target: { value: 'https://example.com/v1' } });
    fireEvent.change(screen.getByLabelText('Model identifier'), { target: { value: 'my-model' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'test-secret' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save API connection' }));
    await waitFor(() => expect(engine.configureEngine).toHaveBeenCalledWith('https://example.com/v1', 'my-model', 'test-secret'));
    expect(screen.getByLabelText('API key')).toHaveValue(''); expect(localStorage.getItem('test-secret')).toBeNull();
  });
  it('supports resuming and reports download failures', async () => {
    vi.mocked(engine.modelAction).mockRejectedValueOnce('Network interrupted');
    render(<EngineSetup status={{ ...status, local: { ...status.local, state: 'paused', downloaded: 100 } }} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Resume download' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Network interrupted');
    expect(engine.modelAction).toHaveBeenCalledWith('download');
  });
  it('never tests a provider automatically', async () => {
    render(<EngineSetup status={{ ...status, hasKey: true }} onChange={vi.fn()} />);
    expect(engine.testApi).not.toHaveBeenCalled(); fireEvent.click(screen.getByRole('button', { name: 'Test connection (may cost)' }));
    await waitFor(() => expect(engine.testApi).toHaveBeenCalledOnce());
  });
});

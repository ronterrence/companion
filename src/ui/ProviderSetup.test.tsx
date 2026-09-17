import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ProviderSetup } from './ProviderSetup';
import { ProviderActivity } from './ProviderChatControls';
import axe from 'axe-core';
import * as engine from '../services/engine';
vi.mock('../services/engine', async importOriginal => ({ ...await importOriginal<typeof engine>(), saveProviderProfile: vi.fn(), chooseProviderProfile: vi.fn(), deleteProviderProfile: vi.fn(), discoverProviderModels: vi.fn(), runProviderRequest: vi.fn(), getEngineStatus: vi.fn(), providerActivity: vi.fn() }));
const profile: engine.ProviderProfile = { id: 'one', name: 'My OpenAI', provider: 'openai', baseUrl: 'https://api.openai.com/v1', model: 'gpt-4.1-mini', limits: null, testedAt: null };
const status = { profiles: [profile], selectedProfile: 'one', models: [{ id: 'gpt-4.1-mini', provider: 'openai', limits: { context: 1000000, output: 32768 }, thinking: 'none', qualification: 'documented; live qualification pending' }] } as engine.EngineStatus;
const usage: engine.Usage = { input: null, output: null, reasoning: null, cached: null, cacheWrite: null, estimatedUsd: null, priceDate: null };
beforeEach(() => { vi.clearAllMocks(); vi.mocked(engine.getEngineStatus).mockResolvedValue(status); vi.mocked(engine.providerActivity).mockResolvedValue([]); });
describe('provider connections', () => {
  it('has labeled, structurally accessible setup controls', async () => {
    const { container } = render(<ProviderSetup status={status} onChange={vi.fn()} />);
    const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
    expect(result.violations.map(v => v.id)).toEqual([]);
  });
  it('uses official provider selection and never tests or discovers automatically', () => {
    render(<ProviderSetup status={status} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('API base URL')).not.toBeInTheDocument();
    expect(engine.runProviderRequest).not.toHaveBeenCalled(); expect(engine.discoverProviderModels).not.toHaveBeenCalled();
  });
  it('adds a profile, clears the entered key, and does not silently select it', async () => {
    render(<ProviderSetup status={status} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Second account' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'fixture-secret' } });
    fireEvent.change(screen.getByLabelText('Model identifier'), { target: { value: 'gpt-4.1-mini' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save API connection' }));
    await waitFor(() => expect(engine.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ name: 'Second account', provider: 'openai', key: 'fixture-secret', limits: null })));
    expect(screen.getByLabelText('API key')).toHaveValue(''); expect(engine.chooseProviderProfile).not.toHaveBeenCalled();
  });
  it('edits a model without requiring the saved key again', async () => {
    render(<ProviderSetup status={status} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Edit My OpenAI' }));
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Renamed' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save API connection' }));
    await waitFor(() => expect(engine.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ id: 'one', key: undefined, name: 'Renamed' })));
  });
  it('requires explicit advanced limits for an unknown model', async () => {
    render(<ProviderSetup status={status} onChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText('Connection name'), { target: { value: 'Custom account' } });
    fireEvent.change(screen.getByLabelText('API key'), { target: { value: 'fixture-secret' } });
    fireEvent.change(screen.getByLabelText('Model identifier'), { target: { value: 'unverified-model' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save API connection' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Confirm the documented limits');expect(engine.saveProviderProfile).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Advanced settings for unverified model' }));fireEvent.click(screen.getByRole('checkbox'));fireEvent.click(screen.getByRole('button', { name: 'Save API connection' }));
    await waitFor(() => expect(engine.saveProviderProfile).toHaveBeenCalledWith(expect.objectContaining({ limits: { context: 32768, output: 8192 } })));
  });
  it('tests only the selected saved connection after explicit action', async () => {
    vi.mocked(engine.runProviderRequest).mockResolvedValue({ id: 'r', sessionId: '', profileId: 'one', model: 'gpt-4.1-mini', action: 'test', createdAt: '2026-09-17', reply: { status: 'complete', content: 'OK', usage, message: null } });
    render(<ProviderSetup status={status} onChange={vi.fn()} />);fireEvent.click(screen.getByRole('button', { name: 'Test My OpenAI (may cost)' }));
    await screen.findByText(/Connection test succeeded for/);expect(engine.runProviderRequest).toHaveBeenCalledWith(expect.objectContaining({ profileId: 'one', action: 'test' }));
  });
  it('requires confirmation before deleting one profile', async () => {
    render(<ProviderSetup status={status} onChange={vi.fn()} />);fireEvent.click(screen.getByRole('button', { name: 'Delete My OpenAI' }));expect(engine.deleteProviderProfile).not.toHaveBeenCalled();fireEvent.click(screen.getByRole('button', { name: 'Confirm deletion' }));await waitFor(() => expect(engine.deleteProviderProfile).toHaveBeenCalledWith('one'));
  });
  it('shows unknown usage and cost instead of treating them as zero', async () => {
    vi.mocked(engine.providerActivity).mockResolvedValue([{ id: 'r', sessionId: '', profileId: 'one', model: 'gpt-4.1-mini', action: 'test', createdAt: '2026-09-17', reply: { status: 'cancelled', content: '', usage, message: null } }]);
    render(<ProviderActivity />);expect(await screen.findByText(/1 request\(s\) have unknown cost/)).toBeVisible();expect(screen.getByText('unknown / unknown')).toBeVisible();
  });
});

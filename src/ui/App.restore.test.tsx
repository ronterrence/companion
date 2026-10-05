import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, expect, it, vi } from 'vitest';
import App from './App';
import * as engine from '../services/engine';
import type { Message, Session } from '../domain/types';

const saved: Session = {
  id: 'saved-local-chat', companionId: 'root-cause', createdAt: '2026-10-05T00:00:00.000Z',
  executionMode: 'local', memoryMode: 'session',
};
const messages: Message[] = [
  { id: 'question', sessionId: saved.id, role: 'user', content: 'What is two plus two?', createdAt: saved.createdAt, provider: 'local' },
  { id: 'answer', sessionId: saved.id, role: 'assistant', content: 'Two plus two equals 4.', createdAt: saved.createdAt, provider: 'local' },
];

vi.mock('../services/repository', () => ({
  createRepository: () => ({
    listCompanions: async () => [], listSessions: async () => [saved], listMessages: async () => messages,
  }),
}));
vi.mock('../services/engine', async importOriginal => ({
  ...await importOriginal<typeof engine>(),
  isDesktop: () => true, getEngineStatus: vi.fn(), getChatContext: vi.fn(), providerActivity: vi.fn(),
  selectEngine: vi.fn(), beginChat: vi.fn(), endChat: vi.fn(),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(engine.getEngineStatus).mockResolvedValue({
    setupComplete: true, engine: 'local', baseUrl: null, model: null, hasKey: false, profiles: [],
    local: { state: 'ready', downloaded: 1, total: 1, installed: true, error: null, availableRam: null },
    catalog: { name: 'Local', license: '', licenseUrl: '', revision: '', size: 1, runtime: 'local' },
  });
  vi.mocked(engine.getChatContext).mockResolvedValue({
    summary: '', covered: 0, preferences: engine.defaultPreferences, profileId: null, model: null, limits: null,
  });
  vi.mocked(engine.providerActivity).mockResolvedValue([]);
});

it('reopens a saved local conversation with the local model selected', async () => {
  render(<App />);
  fireEvent.click(await screen.findByRole('button', { name: 'My Companions' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open conversation' }));
  expect(await screen.findByText('Two plus two equals 4.')).toBeVisible();
  expect(screen.getByText('Conversation restored. Local model ready.')).toBeVisible();
  await waitFor(() => expect(engine.selectEngine).toHaveBeenCalledWith('local'));
});

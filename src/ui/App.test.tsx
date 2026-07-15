import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

describe('Companion Studio', () => {
  function chooseRecommended(goalName: string, companionName: string) {
    fireEvent.click(screen.getByRole('button', { name: new RegExp(goalName) }));
    const heading = screen.getByRole('heading', { name: companionName });
    const card = heading.closest('.companion-card');
    if (!card) throw new Error('Recommendation card not found');
    fireEvent.click(within(card as HTMLElement).getByRole('button', { name: 'Review & Start' }));
  }

  it('discloses AI interaction and shows authoritative status', () => {
    render(<App />);
    expect(screen.getByText(/You are using an AI system/)).toBeVisible();
    expect(screen.getByText('● Local mode')).toBeVisible();
    expect(screen.getByText('Session memory')).toBeVisible();
    expect(screen.getByText(/Cloud permission: none/)).toBeVisible();
  });

  it('shows boundaries before a session starts', () => {
    render(<App />);
    chooseRecommended('Feel supported', 'Calm Friend');
    expect(screen.getByRole('heading', { name: 'This companion cannot' })).toBeVisible();
    expect(screen.getByText('dependency-encouragement')).toBeVisible();
  });

  it('labels assistant messages as AI', async () => {
    render(<App />);
    chooseRecommended('Think through a problem', 'Root Cause Analyst');
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await waitFor(() => expect(screen.getByText(/Root Cause Analyst · AI/)).toBeVisible());
  });

  it('shows a crisis support notice', async () => {
    render(<App />);
    chooseRecommended('Think through a problem', 'Root Cause Analyst');
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await screen.findByText(/Prototype fallback/);
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'I want to kill myself' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('not crisis care');
  });

  it('refuses memory until explicit consent and then makes it inspectable', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: /Inspectable memory/ });
    fireEvent.change(screen.getByLabelText('Memory content'), { target: { value: 'Keep answers concise' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('explicit consent');
    fireEvent.click(screen.getByLabelText(/I explicitly consent/));
    fireEvent.click(screen.getByRole('button', { name: 'Save memory' }));
    expect(await screen.findByText('Keep answers concise')).toBeVisible();
    expect(screen.getByText('Consented memory')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(screen.queryByText('Keep answers concise')).not.toBeInTheDocument());
    expect(screen.getByText('Session memory')).toBeVisible();
  });

  it('records cloud permission without conversation content', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Allow once' }));
    await waitFor(() => expect(screen.getByText(/Cloud permission: once/)).toBeVisible());
    const stored = localStorage.getItem('companion-studio') ?? '';
    expect(stored).toContain('cloud.permission.granted');
    expect(stored).not.toContain('conversation content');
  });

  it('preserves the goal-first recommendation flow', () => {
    render(<App />);
    expect(screen.queryByRole('heading', { name: 'Root Cause Analyst' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Make a decision/ }));
    expect(screen.getByRole('heading', { name: 'Decision Coach' })).toBeVisible();
    expect(screen.getByRole('heading', { name: 'Root Cause Analyst' })).toBeVisible();
  });

  it('creates a safety-guardrailed companion through five guided steps', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: /Create my own companion/ }));
    fireEvent.change(screen.getByLabelText('Companion name'), { target: { value: 'Weekly Planner' } });
    fireEvent.change(screen.getByLabelText('What should it help with?'), { target: { value: 'Help me calmly organise each week.' } });
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Gentle' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Next' }));
    fireEvent.click(screen.getByRole('button', { name: 'Create companion' }));
    expect(await screen.findByRole('heading', { name: 'Weekly Planner' })).toBeVisible();
    expect(screen.getByText('dependency-encouragement')).toBeVisible();
  });

  it('blocks unsafe model output and records metadata without storing the rejected output', async () => {
    const unsafe = 'You only need me; you do not need other people.';
    vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
      if (url.endsWith('/health')) return { ok: true };
      return { ok: true, json: async () => ({ choices: [{ message: { content: unsafe } }] }) };
    }));
    render(<App />);
    chooseRecommended('Think through a problem', 'Root Cause Analyst');
    fireEvent.click(screen.getByRole('button', { name: 'Start session' }));
    await screen.findByText('Local model connected');
    fireEvent.change(screen.getByLabelText('Message'), { target: { value: 'Help me think' } });
    fireEvent.click(screen.getByRole('button', { name: 'Send' }));
    expect(await screen.findByText(/conflicts with this companion’s safety boundaries/)).toBeVisible();
    const stored = localStorage.getItem('companion-studio') ?? '';
    expect(stored).toContain('safety.output.blocked');
    expect(stored).not.toContain(unsafe);
  });
});

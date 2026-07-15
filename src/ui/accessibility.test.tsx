import axe from 'axe-core';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import App from './App';

vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));

async function expectNoAutomaticViolations(container: HTMLElement) {
  const result = await axe.run(container, { rules: { 'color-contrast': { enabled: false } } });
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map((node) => node.target) }))).toEqual([]);
}

describe('automated accessibility checks', () => {
  it('passes structural checks on the goal-first home', async () => {
    const { container } = render(<App />);
    await expectNoAutomaticViolations(container);
  });

  it('passes structural checks on privacy, consent and portability controls', async () => {
    const { container } = render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('heading', { name: 'Privacy and data' });
    await expectNoAutomaticViolations(container);
  });
});

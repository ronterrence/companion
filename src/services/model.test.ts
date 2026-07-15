import { afterEach, describe, expect, it, vi } from 'vitest';
import { companions } from '../domain/companions';
import type { Message } from '../domain/types';
import { CloudProvider, LlamaCppProvider } from './model';

afterEach(() => vi.unstubAllGlobals());

describe('llama.cpp provider contract', () => {
  it('reports unavailable without claiming local inference', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(new LlamaCppProvider().isAvailable()).resolves.toBe(false);
  });

  it('uses loopback chat completions and declares identity and boundaries', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ choices: [{ message: { content: 'Local response' } }] }) });
    vi.stubGlobal('fetch', fetchMock);
    const messages: Message[] = [{ id: 'm1', sessionId: 's1', role: 'user', content: 'Help me', createdAt: 'now', provider: 'prototype' }];
    await expect(new LlamaCppProvider().complete(companions[1], messages)).resolves.toBe('Local response');
    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://127.0.0.1:8080/v1/chat/completions');
    const body = JSON.parse(String(options.body)) as { messages: { content: string }[] };
    expect(body.messages[0].content).toContain('never a human');
    expect(body.messages[0].content).toContain('dependency-encouragement');
  });
});

describe('cloud provider minimisation', () => {
  it('requires HTTPS outside loopback', () => {
    expect(() => new CloudProvider('http://cloud.example.eu')).toThrow('HTTPS');
  });

  it('sends only the latest user message and bounded manifest metadata', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ content: 'Cloud response' }) });
    vi.stubGlobal('fetch', fetchMock);
    const messages: Message[] = [
      { id: 'old', sessionId: 's1', role: 'user', content: 'older private context', createdAt: '1', provider: 'local' },
      { id: 'ai', sessionId: 's1', role: 'assistant', content: 'assistant context', createdAt: '2', provider: 'local' },
      { id: 'new', sessionId: 's1', role: 'user', content: 'latest train schedule', createdAt: '3', provider: 'local' },
    ];
    await expect(new CloudProvider('https://approved.example.eu').complete(companions[0], messages)).resolves.toBe('Cloud response');
    const [, options] = fetchMock.mock.calls[0] as [string, RequestInit];
    const body = String(options.body);
    expect(body).toContain('latest train schedule');
    expect(body).not.toContain('older private context');
    expect(body).not.toContain('assistant context');
    expect(options.credentials).toBe('omit');
  });
});

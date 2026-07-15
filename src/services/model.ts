import type { CompanionManifest, Message } from '../domain/types';

export interface ModelProvider {
  readonly id: 'local' | 'cloud' | 'prototype';
  isAvailable(): Promise<boolean>;
  complete(companion: CompanionManifest, messages: Message[]): Promise<string>;
}

export class PrototypeProvider implements ModelProvider {
  readonly id = 'prototype' as const;
  async isAvailable() { return true; }
  async complete(companion: CompanionManifest) { return companion.reply; }
}

export class LlamaCppProvider implements ModelProvider {
  readonly id = 'local' as const;
  constructor(private endpoint = 'http://127.0.0.1:8080') {}
  async isAvailable() {
    try { return (await fetch(`${this.endpoint}/health`)).ok; } catch { return false; }
  }
  async complete(companion: CompanionManifest, messages: Message[]) {
    const response = await fetch(`${this.endpoint}/v1/chat/completions`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model: 'local', messages: [
        { role: 'system', content: `You are an AI, never a human. Purpose: ${companion.purpose}. Prohibited: ${companion.prohibitedCapabilities.join(', ')}.` },
        ...messages.map(({ role, content }) => ({ role, content })),
      ] }),
    });
    if (!response.ok) throw new Error('Local model unavailable');
    const body = await response.json() as { choices: { message: { content: string } }[] };
    return body.choices[0]?.message.content ?? '';
  }
}

export class CloudProvider implements ModelProvider {
  readonly id = 'cloud' as const;
  private endpoint: string;

  constructor(endpoint: string) {
    const parsed = new URL(endpoint);
    if (parsed.protocol !== 'https:' && parsed.hostname !== '127.0.0.1' && parsed.hostname !== 'localhost') {
      throw new Error('Cloud endpoint must use HTTPS');
    }
    this.endpoint = endpoint.replace(/\/$/, '');
  }

  async isAvailable() {
    try { return (await fetch(`${this.endpoint}/health`, { credentials: 'omit' })).ok; } catch { return false; }
  }

  async complete(companion: CompanionManifest, messages: Message[]) {
    const latestUserMessage = [...messages].reverse().find((message) => message.role === 'user');
    if (!latestUserMessage) throw new Error('Cloud request has no user message');
    const response = await fetch(`${this.endpoint}/v1/companion-response`, {
      method: 'POST', credentials: 'omit', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        companion: { id: companion.id, purpose: companion.purpose, policyVersion: companion.policyVersion },
        message: latestUserMessage.content,
      }),
    });
    if (!response.ok) throw new Error('Cloud model unavailable');
    const body = await response.json() as { content: string };
    return body.content;
  }
}

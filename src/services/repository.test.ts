import { describe, expect, it } from 'vitest';
import { BrowserRepository } from './repository';
import type { MemoryRecord } from '../domain/types';
import { companions } from '../domain/companions';

const memory: MemoryRecord = { id: 'm1', companionId: 'c1', content: 'Prefers short answers', purpose: 'response personalisation', sourceSessionId: 's1', consentedAt: '2026-07-15T00:00:00Z' };

describe('consented persistence', () => {
  it('persists sessions and keeps messages scoped to their session', async () => {
    const storage = localStorage;
    const first = new BrowserRepository(storage);
    await first.saveSession({ id: 's1', companionId: 'c1', createdAt: 'now', executionMode: 'local', memoryMode: 'session' });
    await first.saveMessage({ id: 'one', sessionId: 's1', role: 'user', content: 'first', createdAt: '1', provider: 'local' });
    await first.saveMessage({ id: 'two', sessionId: 's2', role: 'user', content: 'second', createdAt: '2', provider: 'local' });
    const reopened = new BrowserRepository(storage);
    expect(await reopened.listMessages('s1')).toEqual([
      { id: 'one', sessionId: 's1', role: 'user', content: 'first', createdAt: '1', provider: 'local' },
    ]);
  });

  it('persists companion manifests across repository instances', async () => {
    const storage = localStorage;
    const first = new BrowserRepository(storage);
    await first.saveCompanion(companions[0]);
    const reopened = new BrowserRepository(storage);
    expect(await reopened.listCompanions()).toEqual([companions[0]]);
  });

  it('refuses durable memory without explicit consent', async () => {
    const repository = new BrowserRepository();
    await expect(repository.saveMemory(memory, false)).rejects.toThrow('explicit consent');
    expect(await repository.listMemories('c1')).toEqual([]);
  });

  it('scopes memories by companion and supports deletion', async () => {
    const repository = new BrowserRepository();
    await repository.saveMemory(memory, true);
    expect(await repository.listMemories('c1')).toEqual([memory]);
    expect(await repository.listMemories('other')).toEqual([]);
    await repository.deleteMemory('m1');
    expect(await repository.listMemories('c1')).toEqual([]);
  });

  it('does not place raw content in audit metadata unless explicitly supplied', async () => {
    const repository = new BrowserRepository();
    await repository.appendAudit({ id: 'a1', type: 'cloud.permission.granted', createdAt: '2026-07-15T00:00:00Z', policyVersion: '1', metadata: { scope: 'once' } });
    expect(JSON.stringify(await repository.listAuditEvents())).not.toContain(memory.content);
  });
});

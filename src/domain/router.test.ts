import { describe, expect, it } from 'vitest';
import { classifyRouteRequest, selectRoute } from './router';
import type { RuntimeStatus } from './types';
const status: RuntimeStatus = { executionMode: 'local', memoryMode: 'session', safetyPolicyVersion: '1', cloudPermission: 'none', localProviderAvailable: true };
describe('selected engine routing', () => {
  it('keeps requests local when local is selected', () => expect(selectRoute(classifyRouteRequest('Latest news'), status)).toBe('local'));
  it('requires permission for ordinary API conversation', () => expect(selectRoute(classifyRouteRequest('Hello'), { ...status, executionMode: 'cloud' })).toBe('permission-required'));
  it('allows ordinary conversation with session permission', () => expect(selectRoute(classifyRouteRequest('Help me study'), { ...status, executionMode: 'cloud', cloudPermission: 'session' })).toBe('cloud'));
  it('blocks sensitive cloud context without silently switching engines', () => expect(selectRoute(classifyRouteRequest('Earlier: me@example.com Now: hello'), { ...status, executionMode: 'cloud', cloudPermission: 'session' })).toBe('blocked'));
  it('preserves one-request consent', () => expect(selectRoute(classifyRouteRequest('Hello'), { ...status, executionMode: 'cloud', cloudPermission: 'once' })).toBe('cloud'));
});

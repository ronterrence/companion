import { describe, expect, it } from 'vitest';
import { classifyRouteRequest, selectRoute } from './router';
import type { RuntimeStatus } from './types';

const status: RuntimeStatus = { executionMode: 'local', memoryMode: 'session', safetyPolicyVersion: '1', cloudPermission: 'none', localProviderAvailable: true };

describe('governed routing', () => {
  it('keeps ordinary requests local', () => expect(selectRoute({ requiresCurrentInformation: false, containsSensitiveData: false }, status)).toBe('local'));
  it('keeps sensitive data local even when cloud is permitted', () => expect(selectRoute({ requiresCurrentInformation: true, containsSensitiveData: true }, { ...status, cloudPermission: 'once' })).toBe('local'));
  it('requires permission before cloud use', () => expect(selectRoute({ requiresCurrentInformation: true, containsSensitiveData: false }, status)).toBe('permission-required'));
  it('routes only an eligible request with permission', () => expect(selectRoute({ requiresCurrentInformation: true, containsSensitiveData: false }, { ...status, cloudPermission: 'once' })).toBe('cloud'));
  it('classifies current requests and sensitive identifiers', () => {
    expect(classifyRouteRequest('What is the latest train schedule?')).toEqual({ requiresCurrentInformation: true, containsSensitiveData: false });
    expect(classifyRouteRequest('Latest update for me@example.eu')).toEqual({ requiresCurrentInformation: true, containsSensitiveData: true });
  });
});

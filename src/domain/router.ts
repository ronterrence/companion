import type { RuntimeStatus } from './types';

export interface RouteRequest { containsSensitiveData: boolean }

export function selectRoute(request: RouteRequest, status: RuntimeStatus): 'local' | 'cloud' | 'permission-required' | 'blocked' {
  if (status.executionMode === 'local') return 'local';
  if (request.containsSensitiveData) return 'blocked';
  return status.cloudPermission !== 'none' ? 'cloud' : 'permission-required';
}

export function classifyRouteRequest(text: string): RouteRequest {
  const containsSensitiveData = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:password|passport|medical record|diagnosis|credit card|social security|national id)\b|\b\+?\d[\d .()-]{7,}\d\b)/i.test(text);
  return { containsSensitiveData };
}

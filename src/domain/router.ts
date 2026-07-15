import type { RuntimeStatus } from './types';

export interface RouteRequest { requiresCurrentInformation: boolean; containsSensitiveData: boolean }

export function selectRoute(request: RouteRequest, status: RuntimeStatus): 'local' | 'cloud' | 'permission-required' {
  if (!request.requiresCurrentInformation || request.containsSensitiveData) return 'local';
  return status.cloudPermission === 'once' ? 'cloud' : 'permission-required';
}

export function classifyRouteRequest(text: string): RouteRequest {
  const requiresCurrentInformation = /\b(?:latest|current|today|news|weather|price|schedule)\b/i.test(text);
  const containsSensitiveData = /(?:\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b|\b(?:password|passport|medical record|diagnosis|credit card|social security|national id)\b|\b\+?\d[\d .()-]{7,}\d\b)/i.test(text);
  return { requiresCurrentInformation, containsSensitiveData };
}

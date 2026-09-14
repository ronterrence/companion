export type ExecutionMode = 'local' | 'cloud';
export type MemoryMode = 'session' | 'consented';
export type RiskClass = 'minimal' | 'limited' | 'high' | 'prohibited';

export interface CompanionManifest {
  schemaVersion: '1.0';
  id: string;
  name: string;
  purpose: string;
  style: string[];
  minimumAge: number;
  riskClass: RiskClass;
  allowedCapabilities: string[];
  prohibitedCapabilities: string[];
  memoryPolicy: 'session-only' | 'explicit-consent';
  cloudPolicy: 'disabled' | 'ask-every-time' | 'ask-per-session';
  policyVersion: string;
  opening: string;
  reply: string;
}

export interface Message {
  id: string;
  sessionId: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  provider: 'local' | 'cloud' | 'prototype';
}

export interface Session {
  id: string;
  companionId: string;
  createdAt: string;
  endedAt?: string;
  executionMode: ExecutionMode;
  memoryMode: MemoryMode;
}

export interface MemoryRecord {
  id: string;
  companionId: string;
  content: string;
  purpose: string;
  sourceSessionId: string;
  consentedAt: string;
  expiresAt?: string;
}

export interface RuntimeStatus {
  executionMode: ExecutionMode;
  memoryMode: MemoryMode;
  safetyPolicyVersion: string;
  cloudPermission: 'none' | 'once' | 'session';
  localProviderAvailable: boolean;
}

export interface AuditEvent {
  id: string;
  type: string;
  createdAt: string;
  policyVersion: string;
  metadata: Record<string, string | boolean | number>;
}

import { invoke } from '@tauri-apps/api/core';
import type { CompanionManifest, Message } from '../domain/types';

export const isDesktop = () => '__TAURI_INTERNALS__' in window;
export type EngineChoice = 'prototype' | 'local' | 'api';
export interface EngineStatus {
  setupComplete: boolean; engine: EngineChoice; baseUrl: string | null; model: string | null; hasKey: boolean;
  local: { state: string; downloaded: number; total: number; error: string | null; installed: boolean; availableRam: number | null };
  catalog: { name: string; license: string; licenseUrl: string; revision: string; size: number; runtime: string };
}
export const getEngineStatus = () => invoke<EngineStatus>('get_engine_status');
export const selectEngine = (choice: EngineChoice) => invoke<void>('select_engine', { choice });
export const configureEngine = (baseUrl: string, model: string, key: string) => invoke<void>('configure_engine', { baseUrl, model, key });
export const removeApiKey = () => invoke<void>('remove_api_key');
export const testApi = () => invoke<void>('test_api');
export const modelAction = (action: 'download' | 'cancel' | 'start' | 'stop' | 'remove') => invoke<void>('model_action', { action });
export const beginChat = (sessionId: string, companion: CompanionManifest) => invoke<void>('begin_chat', { sessionId, companion });
export const authorizeChat = (sessionId: string, allow: boolean) => invoke<void>('authorize_chat', { sessionId, allow });
export const endChat = (sessionId: string) => invoke<void>('end_chat', { sessionId });
export const completeChat = (sessionId: string, messages: Message[]) => invoke<{ content: string; provider: Message['provider']; blocked: boolean }>('complete_chat', {
  sessionId, messages: messages.map(({ role, content }) => ({ role, content })),
});
export const engineError = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : 'Operation failed. Please retry.';

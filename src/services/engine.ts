import { invoke } from '@tauri-apps/api/core';
import type { CompanionManifest, Message } from '../domain/types';

export const isDesktop = () => '__TAURI_INTERNALS__' in window;
export type EngineChoice = 'prototype' | 'local' | 'api';
export interface EngineStatus {
  profiles?: ProviderProfile[]; selectedProfile?: string | null; models?: ModelSpec[];
  setupComplete: boolean; engine: EngineChoice; baseUrl: string | null; model: string | null; hasKey: boolean;
  local: { state: string; downloaded: number; total: number; error: string | null; installed: boolean; availableRam: number | null };
  catalog: { name: string; license: string; licenseUrl: string; revision: string; size: number; runtime: string };
}
export type ProviderKind = 'openai' | 'anthropic' | 'deepseek' | 'custom';
export interface Limits { context: number; output: number }
export interface ProviderProfile { id: string; name: string; provider: ProviderKind; baseUrl: string; model: string; limits: Limits | null; testedAt: string | null }
export interface ModelSpec { id: string; provider: ProviderKind; limits: Limits; thinking: 'none' | ProviderKind; qualification: string }
export interface Preferences { length: 'brief' | 'standard' | 'detailed'; thinking: 'quick' | 'balanced' | 'deep' }
export const defaultPreferences: Preferences = { length: 'standard', thinking: 'balanced' };
export interface Usage { input: number | null; output: number | null; reasoning: number | null; cached: number | null; cacheWrite: number | null; estimatedUsd: number | null; priceDate: string | null }
export interface ProviderReply { content: string; status: 'complete' | 'truncated' | 'cancelled' | 'refused' | 'failed' | 'interrupted'; usage: Usage; message: string | null }
export interface ProviderOutcome { id: string; sessionId: string; profileId: string; model: string; action: ProviderAction; createdAt: string; reply: ProviderReply }
export type ProviderAction = 'send' | 'retry' | 'continue' | 'summarize' | 'test';
export interface ContextAssessment { estimatedInput: number; availableInput: number; nearLimit: boolean; overLimit: boolean; summarized: boolean }
export const saveProviderProfile = (input: Omit<ProviderProfile, 'id' | 'testedAt'> & { id?: string; key?: string }) => invoke<void>('save_provider_profile', { input });
export const chooseProviderProfile = (id: string) => invoke<void>('choose_provider_profile', { id });
export const deleteProviderProfile = (id: string) => invoke<void>('delete_provider_profile', { id });
export const discoverProviderModels = (id: string) => invoke<string[]>('discover_provider_models', { id });
export const runProviderRequest = (request: { id: string; sessionId: string; action: ProviderAction; preferences: Preferences; message?: Message; profileId?: string; expectedModel?: string }) => invoke<ProviderOutcome>('run_provider_request', { request });
export const cancelProviderRequest = (id: string) => invoke<void>('cancel_provider_request', { id });
export type ProviderActivityEntry = Omit<ProviderOutcome, 'reply'> & { reply: Omit<ProviderReply, 'content'> };
export const providerActivity = () => invoke<ProviderActivityEntry[]>('provider_activity');
export const getProviderResult = (id: string) => invoke<ProviderOutcome | null>('get_provider_result', { id });
export const assessChatContext = (sessionId: string, preferences: Preferences, draft = '') => invoke<ContextAssessment>('assess_chat_context', { sessionId, preferences, draft });
export const getChatContext = (sessionId: string) => invoke<{ summary: string; covered: number; preferences: Preferences; profileId: string | null; model: string | null; limits: Limits | null }>('get_chat_context', { sessionId });
export const getEngineStatus = () => invoke<EngineStatus>('get_engine_status');
export const selectEngine = (choice: EngineChoice) => invoke<void>('select_engine', { choice });
export const configureEngine = (baseUrl: string, model: string, key: string) => invoke<void>('configure_engine', { baseUrl, model, key });
export const removeApiKey = () => invoke<void>('remove_api_key');
export const testApi = () => invoke<void>('test_api');
export const modelAction = (action: 'download' | 'cancel' | 'start' | 'stop' | 'remove') => invoke<void>('model_action', { action });
export const beginChat = (sessionId: string, companion: CompanionManifest) => invoke<void>('begin_chat', { sessionId, companion });
export const authorizeChat = (sessionId: string, allow: boolean, expectedProfile?: string, expectedModel?: string) => invoke<void>('authorize_chat', { sessionId, allow, expectedProfile, expectedModel });
export const endChat = (sessionId: string) => invoke<void>('end_chat', { sessionId });
export const completeChat = (sessionId: string, messages: Message[]) => invoke<{ content: string; provider: Message['provider']; blocked: boolean }>('complete_chat', {
  sessionId, messages: messages.map(({ role, content }) => ({ role, content })),
});
export const engineError = (error: unknown) => error instanceof Error ? error.message : typeof error === 'string' ? error : 'Operation failed. Please retry.';

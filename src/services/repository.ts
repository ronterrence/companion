import type { AuditEvent, CompanionManifest, MemoryRecord, Message, Session } from '../domain/types';

export interface Repository {
  saveCompanion(companion: CompanionManifest): Promise<void>;
  listCompanions(): Promise<CompanionManifest[]>;
  saveSession(session: Session): Promise<void>;
  listSessions(): Promise<Session[]>;
  saveMessage(message: Message): Promise<void>;
  listMessages(sessionId: string): Promise<Message[]>;
  saveMemory(memory: MemoryRecord, consent: boolean): Promise<void>;
  listMemories(companionId: string): Promise<MemoryRecord[]>;
  deleteMemory(id: string): Promise<void>;
  appendAudit(event: AuditEvent): Promise<void>;
  listAuditEvents(): Promise<AuditEvent[]>;
}

interface StoredData {
  companions: CompanionManifest[]; sessions: Session[]; messages: Message[]; memories: MemoryRecord[]; auditEvents: AuditEvent[];
}

const emptyData = (): StoredData => ({ companions: [], sessions: [], messages: [], memories: [], auditEvents: [] });

export class BrowserRepository implements Repository {
  async listSessions() { return [...this.data.sessions].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); }
  private data: StoredData;
  constructor(private storage?: Storage) {
    const raw = storage?.getItem('companion-studio');
    this.data = raw ? { ...emptyData(), ...JSON.parse(raw) as Partial<StoredData> } : emptyData();
  }
  private persist() { this.storage?.setItem('companion-studio', JSON.stringify(this.data)); }
  async saveCompanion(companion: CompanionManifest) { this.data.companions = [...this.data.companions.filter((item) => item.id !== companion.id), companion]; this.persist(); }
  async listCompanions() { return [...this.data.companions]; }
  async saveSession(session: Session) { this.data.sessions.push(session); this.persist(); }
  async saveMessage(message: Message) { this.data.messages.push(message); this.persist(); }
  async listMessages(sessionId: string) { return this.data.messages.filter((m) => m.sessionId === sessionId); }
  async saveMemory(memory: MemoryRecord, consent: boolean) {
    if (!consent) throw new Error('Durable memory requires explicit consent');
    this.data.memories.push(memory); this.persist();
  }
  async listMemories(companionId: string) { return this.data.memories.filter((m) => m.companionId === companionId); }
  async deleteMemory(id: string) { this.data.memories = this.data.memories.filter((m) => m.id !== id); this.persist(); }
  async appendAudit(event: AuditEvent) { this.data.auditEvents.push(event); this.persist(); }
  async listAuditEvents() { return [...this.data.auditEvents]; }
}

export class NativeRepository implements Repository {
  async listSessions() { return this.invoke<Session[]>('list_sessions', {}); }
  private async invoke<T>(command: string, args: Record<string, unknown>): Promise<T> {
    const { invoke } = await import('@tauri-apps/api/core');
    return invoke<T>(command, args);
  }
  async saveCompanion(companion: CompanionManifest) { await this.invoke<void>('save_companion', { companion }); }
  async listCompanions() { return this.invoke<CompanionManifest[]>('list_companions', {}); }
  async saveSession(session: Session) { await this.invoke<void>('save_session', { session }); }
  async saveMessage(message: Message) { await this.invoke<void>('save_message', { message }); }
  async listMessages(sessionId: string) { return this.invoke<Message[]>('list_messages', { sessionId }); }
  async saveMemory(memory: MemoryRecord, consent: boolean) { await this.invoke<void>('save_memory', { memory, consent }); }
  async listMemories(companionId: string) { return this.invoke<MemoryRecord[]>('list_memories', { companionId }); }
  async deleteMemory(id: string) { await this.invoke<void>('delete_memory', { id }); }
  async appendAudit(event: AuditEvent) { await this.invoke<void>('append_audit', { event }); }
  async listAuditEvents() { return this.invoke<AuditEvent[]>('list_audit_events', {}); }
}

export function createRepository(): Repository {
  return '__TAURI_INTERNALS__' in window ? new NativeRepository() : new BrowserRepository(window.localStorage);
}

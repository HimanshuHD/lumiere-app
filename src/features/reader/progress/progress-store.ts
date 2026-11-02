import { supabase } from '@/lib/supabase';
import { SaveCoordinator } from './save-coordinator';
import type { PendingSave, PendingStorage, ProgressRow, SaveResult } from './save-coordinator';

function browserStorage(userId: string): PendingStorage {
  const prefix = `lumiere:reading-position:v1:${userId}:`;
  return {
    read: id => JSON.parse(localStorage.getItem(prefix + id) || 'null'),
    write: (id, pending) => localStorage.setItem(prefix + id, JSON.stringify(pending)),
    remove: (id, mutationId) => {
      const saved = JSON.parse(localStorage.getItem(prefix + id) || 'null');
      if (saved?.mutationId === mutationId) localStorage.removeItem(prefix + id);
    },
    documentIds: () => Object.keys(localStorage).filter(key => key.startsWith(prefix)).map(key => key.slice(prefix.length)),
  };
}

export class ProgressStore {
  readonly coordinator: SaveCoordinator;
  loading = true;
  error: string | null = null;
  private request?: Promise<void>;
  private loaded = false;
  private readonly userId: string;
  private listeners = new Set<() => void>();
  constructor(userId: string) {
    this.userId = userId;
    this.coordinator = new SaveCoordinator(browserStorage(userId), async (documentId: string, pending: PendingSave) => {
      const { data, error } = await supabase.rpc('save_reading_position', {
        p_user_id: userId,
        p_document_id: documentId, p_position: pending.position,
        p_chapter_index: pending.chapterIndex, p_scroll_percent: pending.progress,
        p_expected_revision: pending.expectedRevision, p_mutation_id: pending.mutationId,
      });
      if (error) throw error;
      return data as SaveResult;
    });
    this.coordinator.subscribe(() => this.notify());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.listeners.forEach(listener => listener()); }
  load = (): Promise<void> => {
    if (this.request) return this.request;
    if (this.loaded) return Promise.resolve();
    this.loading = true; this.error = null; this.notify();
    this.request = (async () => {
      try {
        const { data, error } = await supabase.from('reading_progress').select('*').eq('user_id', this.userId);
        if (error) throw error;
        this.coordinator.hydrate((data || []) as ProgressRow[]);
        this.loaded = true;
        this.coordinator.retryFailed();
      } catch (error) {
        this.error = error instanceof Error ? error.message : 'Could not load your reading position. Please retry.';
      } finally { this.loading = false; this.request = undefined; this.notify(); }
    })();
    return this.request;
  };
}
const stores = new Map<string, ProgressStore>();
export function getProgressStore(userId: string) {
  let store = stores.get(userId);
  if (!store) { store = new ProgressStore(userId); stores.set(userId, store); }
  return store;
}
// Flush only the active account. The RPC also verifies the expected user ID.
let activeUserId: string | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  if (activeUserId && activeUserId !== session?.user.id) stores.delete(activeUserId);
  activeUserId = session?.user.id;
});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (activeUserId) stores.get(activeUserId)?.coordinator.retryFailed(); });
  window.addEventListener('pagehide', () => { if (activeUserId) void stores.get(activeUserId)?.coordinator.flushAll(); });
}

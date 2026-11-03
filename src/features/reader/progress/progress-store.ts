import { progressRepository } from '@/infrastructure/supabase/progress-repository';
import { browserStorage } from '@/infrastructure/browser/pending-progress';
import { authIntegration } from '@/infrastructure/supabase/auth-integration';
import { SaveCoordinator } from './save-coordinator';
import type { ProgressRow } from './save-coordinator';

export class ProgressStore {
  readonly coordinator: SaveCoordinator;
  loading = true;
  error: string | null = null;
  private request?: Promise<void>;
  private loaded = false;
  private disposed = false;
  private readonly userId: string;
  private listeners = new Set<() => void>();
  constructor(userId: string) {
    this.userId = userId;
    this.coordinator = new SaveCoordinator(browserStorage(userId), (id, pending) => progressRepository.save(userId, id, pending));
    this.coordinator.subscribe(() => this.notify());
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  private notify() { this.listeners.forEach(listener => listener()); }
  dispose() { this.disposed = true; this.coordinator.dispose(); this.listeners.clear(); }
  load = (force = false): Promise<void> => {
    if (this.disposed) return Promise.resolve();
    if (this.request) return this.request;
    if (this.loaded && !force) return Promise.resolve();
    this.loading = true; this.error = null; this.notify();
    this.request = (async () => {
      try {
        const data = await progressRepository.list(this.userId);
        if (this.disposed) return;
        this.coordinator.reconcile((data || []) as ProgressRow[]);
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
export function discardProgressStore(userId: string) {
  const store = stores.get(userId); store?.dispose(); stores.delete(userId);
}
export function getProgressStore(userId: string) {
  let store = stores.get(userId);
  if (!store) { store = new ProgressStore(userId); stores.set(userId, store); }
  return store;
}
// Flush only the active account. The RPC also verifies the expected user ID.
let activeUserId: string | undefined;
authIntegration.subscribe(session => {
  if (activeUserId && activeUserId !== session?.user.id) discardProgressStore(activeUserId);
  activeUserId = session?.user.id;
});
if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (activeUserId) stores.get(activeUserId)?.coordinator.retryFailed(); });
  window.addEventListener('pagehide', () => { if (activeUserId) void stores.get(activeUserId)?.coordinator.flushAll(); });
}

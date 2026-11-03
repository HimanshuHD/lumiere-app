import { SaveCoordinator } from './save-coordinator.ts';
import type { ProgressRow, PendingStorage, PendingSave, SaveResult } from '../../../domain/progress.ts';
export interface ProgressRepository { list(userId: string): Promise<ProgressRow[]>; save(userId: string, id: string, pending: PendingSave): Promise<SaveResult> }

export class ProgressStore {
  readonly coordinator: SaveCoordinator;
  loading = true;
  error: string | null = null;
  private request?: Promise<void>;
  private loaded = false;
  private disposed = false;
  private readonly repository: ProgressRepository;
  private readonly userId: string;
  private listeners = new Set<() => void>();
  constructor(userId: string, repository: ProgressRepository, storage: PendingStorage) {
    this.userId = userId;
    this.repository = repository;
    this.coordinator = new SaveCoordinator(storage, (id, pending) => repository.save(userId, id, pending));
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
        const data = await this.repository.list(this.userId);
        if (this.disposed) return;
        this.coordinator.reconcile(data);
        this.loaded = true;
        this.coordinator.retryFailed();
      } catch (error) {
        if (this.disposed) return;
        this.error = error instanceof Error ? error.message : 'Could not load your reading position. Please retry.';
      } finally { this.loading = false; this.request = undefined; this.notify(); }
    })();
    return this.request;
  };
}

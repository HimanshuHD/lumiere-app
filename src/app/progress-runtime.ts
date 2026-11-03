import { ProgressStore } from '@/features/reader/progress';
import { progressRepository } from '@/infrastructure/supabase/progress-repository';
import { browserStorage } from '@/infrastructure/browser/pending-progress';
const stores = new Map<string, ProgressStore>();
export function getProgressStore(userId: string) {
  let store = stores.get(userId);
  if (!store) { store = new ProgressStore(userId, progressRepository, browserStorage(userId)); stores.set(userId, store); }
  return store;
}
export function discardProgressStore(userId: string) { stores.get(userId)?.dispose(); stores.delete(userId); }
export function retryAccountProgress(userId: string) { stores.get(userId)?.coordinator.retryFailed(); }
export function flushAccountProgress(userId: string) { void stores.get(userId)?.coordinator.flushAll(); }

import { AccountDataStore } from '@/features/data';
import { createUserDataRepository } from '@/infrastructure/supabase/user-data-repository';
import { getProgressStore, discardProgressStore, retryAccountProgress, flushAccountProgress } from '@/app/progress-runtime';

const stores = new Map<string, AccountDataStore>();
export function getAccountStore(userId: string) {
  if (activeUser !== userId) return undefined;
  let store = stores.get(userId); if (!store) { store = new AccountDataStore(userId, createUserDataRepository(userId), id => getProgressStore(userId).coordinator.forget(id)); stores.set(userId, store); } return store;
}
export function cachedAccountStore(userId: string) { return stores.get(userId); }
export function activeAccountStore() { return activeUser ? stores.get(activeUser) : undefined; }
let activeUser: string | undefined;
export function isActiveAccount(userId: string) { return activeUser === userId; }
export function setActiveAccount(next: string | undefined) {
  const previous = activeUser;
  activeUser = next;
  if (previous && previous !== next) {
    stores.get(previous)?.dispose(); stores.delete(previous); discardProgressStore(previous);
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (activeUser) retryAccountProgress(activeUser); });
  window.addEventListener('pagehide', () => { if (activeUser) flushAccountProgress(activeUser); });
}

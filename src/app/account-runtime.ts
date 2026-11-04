import { AccountDataStore } from '@/features/data';
import { createUserDataRepository } from '@/infrastructure/supabase/user-data-repository';
import { getProgressStore, discardProgressStore, retryAccountProgress, flushAccountProgress } from '@/app/progress-runtime';

const stores = new Map<string, AccountDataStore>();
export function getAccountStore(userId: string) {
  let store = stores.get(userId); if (!store) { store = new AccountDataStore(userId, createUserDataRepository(userId), id => getProgressStore(userId).coordinator.forget(id)); stores.set(userId, store); } return store;
}
export function cachedAccountStore(userId: string) { return stores.get(userId); }
export function activeAccountStore() { return activeUser ? stores.get(activeUser) : undefined; }
let activeUser: string | undefined;
export function setActiveAccount(next: string | undefined) {
  if (activeUser && activeUser !== next) {
    stores.get(activeUser)?.dispose(); stores.delete(activeUser); discardProgressStore(activeUser);
  }
  activeUser = next;
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => { if (activeUser) retryAccountProgress(activeUser); });
  window.addEventListener('pagehide', () => { if (activeUser) flushAccountProgress(activeUser); });
}

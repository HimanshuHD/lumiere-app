import { AccountDataStore } from '@/features/data/account-store';
import { createUserDataRepository } from '@/infrastructure/supabase/user-data-repository';
import { supabase } from '@/infrastructure/supabase/client';
import { getProgressStore, discardProgressStore } from '@/features/reader/progress/progress-store';

const stores = new Map<string, AccountDataStore>();
export function getAccountStore(userId: string) {
  let store = stores.get(userId); if (!store) { store = new AccountDataStore(userId, createUserDataRepository(userId), id => getProgressStore(userId).coordinator.forget(id)); stores.set(userId, store); } return store;
}
export function cachedAccountStore(userId: string) { return stores.get(userId); }
export function activeAccountStore() { return activeUser ? stores.get(activeUser) : undefined; }
let activeUser: string | undefined;
supabase.auth.onAuthStateChange((_event, session) => {
  const next = session?.user.id;
  if (activeUser && activeUser !== next) {
    stores.get(activeUser)?.dispose(); stores.delete(activeUser); discardProgressStore(activeUser);
  }
  activeUser = next;
});

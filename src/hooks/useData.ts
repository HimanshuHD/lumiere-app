import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import type { ReadingProgress } from '@/domain/documents';
import { useAuth } from '@/context/AuthContext';
import { getProgressStore } from '@/app/progress-runtime';
import type { ReaderPosition } from '@/domain/reading-position';
import { getAccountStore } from '@/app/account-runtime';
import type { QueryCache } from '@/features/data';

function useAccountStore() {
  const { user } = useAuth();
  return user ? getAccountStore(user.id) : undefined;
}
const empty = { data: [], status: 'idle' as const, error: null };
const subscribeEmpty = () => () => {};
const getEmpty = () => empty;
const emptyPending: ReadonlySet<string> = new Set();
const getEmptyPending = () => emptyPending;
function useQuery<T>(query: QueryCache<T> | undefined, auto = true) {
  const snapshot = useSyncExternalStore(query?.subscribe ?? subscribeEmpty, query?.getSnapshot ?? getEmpty as () => {data:T;status:'idle';error:null});
  useEffect(() => {
    if (auto && query && snapshot.status === 'idle') void query.load().catch(() => {});
  }, [query, snapshot.status, auto]);
  const refetch = useCallback(() => query?.load(true).catch(() => {}) ?? Promise.resolve(), [query]);
  return { ...snapshot, loading: snapshot.status === 'idle' || snapshot.status === 'loading', refetch };
}
function useReferences(table: 'bookmarks' | 'reading_list') {
  const store = useAccountStore();
  const query = table === 'bookmarks' ? store?.bookmarks : store?.readingList;
  const state = useQuery(query);
  const pending = useSyncExternalStore(store?.mutations.subscribe ?? subscribeEmpty, store?.mutations.getSnapshot ?? getEmptyPending);
  const toggle = useCallback((id: string) => store?.toggle(table, id) ?? Promise.resolve({ ok: false as const, message: 'Sign in to save documents.' }), [store, table]);
  const selected = useCallback((id: string) => state.data.some(row => row.document_id === id), [state.data]);
  const busy = useCallback((id: string) => pending.has(`${table}:${id}`), [pending, table]);
  return { ...state, toggle, selected, busy };
}
export function useBookmarks() {
  const state = useReferences('bookmarks');
  return { bookmarks: state.data, loading: state.loading, error: state.error, refetch: state.refetch,
    toggleBookmark: state.toggle, isBookmarked: state.selected, isBookmarkPending: state.busy };
}
export function useReadingList() {
  const store = useAccountStore();
  const state = useReferences('reading_list');
  const removeFromReadingList = useCallback((id: string) => store?.removeReadingList(id) ?? Promise.resolve(), [store]);
  return { readingList: state.data, loading: state.loading, error: state.error, refetch: state.refetch,
    toggleReadingList: state.toggle, isInReadingList: state.selected, isReadingListPending: state.busy, removeFromReadingList };
}
export function useDocuments() {
  const store = useAccountStore(); const state = useQuery(store?.documents);
  const refetch = useCallback(async () => { try { await store?.refresh(); } catch { /* Query snapshots expose each failure. */ } }, [store]);
  return { documents: state.data, loading: state.loading, error: state.error, refetch };
}
export function useCatalogDocuments() {
  const store = useAccountStore(); return useQuery(store?.catalog);
}
export function useDocumentContent(id: string) {
  const store = useAccountStore(); const query = store?.contentQuery(id);
  const state = useQuery(query, false);
  const [validated, setValidated] = useState<typeof query>();
  useEffect(() => {
    let active = true;
    if (query) void query.load(true).then(() => { if (active) setValidated(query); }).catch(() => {});
    return () => { active = false; };
  }, [query]);
  const refetch = useCallback(() => query?.load(true).then(() => setValidated(query)).catch(() => {}) ?? Promise.resolve(), [query]);
  return { ...state, refetch, data: validated === query && state.status === 'success' ? state.data : null };
}

export function useReadingProgress() {
  const { user } = useAuth();
  const store = user ? getProgressStore(user.id) : undefined;
  const [, refresh] = useState(0);
  useEffect(() => {
    if (!store) return;
    const unsubscribe = store.subscribe(() => refresh(value => value + 1));
    void store.load();
    return unsubscribe;
  }, [store]);
  const getProgress = useCallback((id: string): ReadingProgress | undefined => store?.coordinator.snapshot(id).row, [store]);
  const savePosition = useCallback((id: string, position: ReaderPosition, chapter: number, percent: number) => {
    store?.coordinator.record(id, position, chapter, percent);
  }, [store]);
  const flushProgress = useCallback((id: string) => store?.coordinator.flush(id) ?? Promise.resolve(), [store]);
  const retryProgress = useCallback((id: string) => store?.coordinator.retry(id), [store]);
  const getSaveState = useCallback((id: string) => store?.coordinator.snapshot(id), [store]);
  const refetchProgress = useCallback(() => store?.load(true) ?? Promise.resolve(), [store]);
  return {
    progress: store?.coordinator.rows() ?? [], getProgress, savePosition,
    flushProgress, retryProgress, getSaveState,
    loading: !store || store.loading, error: store?.error ?? null,
    refetch: refetchProgress,
  };
}

import { useEffect, useState, useCallback } from 'react';
import { supabase, Document, Bookmark, ReadingProgress, ReadingListItem } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { getProgressStore } from '@/features/reader/progress/progress-store';
import type { ReaderPosition } from '@/features/reader/progress/position';
import { attachLockedDocumentReferences } from '@/services/lockedDocumentReferences';

async function fetchLockedDocumentReferences(): Promise<Document[]> {
  const { data, error } = await supabase.rpc('get_locked_user_upload_references');
  if (error) {
    console.error('Failed to load locked document references:', error);
    return [];
  }
  return (data ?? []) as Document[];
}


export function useBookmarks() {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchBookmarks = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('bookmarks')
      .select('id, user_id, document_id, created_at, document:documents(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });

    if (!error && data) {
      setBookmarks(attachLockedDocumentReferences(
        data as unknown as Bookmark[], await fetchLockedDocumentReferences(),
      ));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchBookmarks();
  }, [fetchBookmarks]);

  const toggleBookmark = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!user) return false;
      const existing = bookmarks.find((b) => b.document_id === documentId);
      if (existing) {
        await supabase.from('bookmarks').delete().eq('id', existing.id);
        setBookmarks((prev) => prev.filter((b) => b.id !== existing.id));
        return false;
      }
      const { data, error } = await supabase
        .from('bookmarks')
        .insert({ document_id: documentId })
        .select('id, user_id, document_id, created_at')
        .single();
      if (!error && data) {
        const { data: doc } = await supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .single();
        if (doc) {
          setBookmarks((prev) => [{ ...data as Bookmark, document: doc as Document }, ...prev]);
        }
        return true;
      }
      return false;
    },
    [user, bookmarks]
  );

  const isBookmarked = useCallback(
    (documentId: string) => bookmarks.some((b) => b.document_id === documentId),
    [bookmarks]
  );

  return { bookmarks, loading, toggleBookmark, isBookmarked, refetch: fetchBookmarks };
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
  return {
    progress: store?.coordinator.rows() ?? [], getProgress, savePosition,
    flushProgress, retryProgress, getSaveState,
    loading: !store || store.loading, error: store?.error ?? null,
    refetch: store?.load ?? (() => Promise.resolve()),
  };
}

export function useReadingList() {
  const { user } = useAuth();
  const [readingList, setReadingList] = useState<ReadingListItem[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchReadingList = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reading_list')
      .select('id, user_id, document_id, created_at, document:documents(*)')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false });
    if (!error && data) {
      setReadingList(attachLockedDocumentReferences(
        data as unknown as ReadingListItem[], await fetchLockedDocumentReferences(),
      ));
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchReadingList();
  }, [fetchReadingList]);

  const toggleReadingList = useCallback(
    async (documentId: string): Promise<boolean> => {
      if (!user) return false;
      const existing = readingList.find((r) => r.document_id === documentId);
      if (existing) {
        await supabase.from('reading_list').delete().eq('id', existing.id);
        setReadingList((prev) => prev.filter((r) => r.id !== existing.id));
        return false;
      }
      const { data, error } = await supabase
        .from('reading_list')
        .insert({ document_id: documentId })
        .select('id, user_id, document_id, created_at')
        .single();
      if (!error && data) {
        const { data: doc } = await supabase
          .from('documents')
          .select('*')
          .eq('id', documentId)
          .single();
        if (doc) {
          setReadingList((prev) => [{ ...data as ReadingListItem, document: doc as Document }, ...prev]);
        }
        return true;
      }
      return false;
    },
    [user, readingList]
  );

  const isInReadingList = useCallback(
    (documentId: string) => readingList.some((r) => r.document_id === documentId),
    [readingList]
  );

  const removeFromReadingList = useCallback(
    async (documentId: string) => {
      if (!user) return;
      const existing = readingList.find((r) => r.document_id === documentId);
      if (existing) {
        await supabase.from('reading_list').delete().eq('id', existing.id);
        setReadingList((prev) => prev.filter((r) => r.id !== existing.id));
      }
    },
    [user, readingList]
  );

  return { readingList, loading, toggleReadingList, isInReadingList, removeFromReadingList, refetch: fetchReadingList };
}

export function useDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    const [documentsResult, membershipsResult, lockedDocuments] = await Promise.all([
      supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('document_library_memberships')
        .select('document_id')
        .eq('user_id', user.id),
      fetchLockedDocumentReferences(),
    ]);

    if (documentsResult.error) {
      console.error('Failed to load documents:', documentsResult.error);
      setLoading(false);
      return;
    }

    if (membershipsResult.error) {
      console.error('Failed to load catalog collection memberships:', membershipsResult.error);
      setDocuments([...((documentsResult.data || []) as Document[]), ...lockedDocuments]
        .filter((document) => document.origin !== 'catalog_import'));
      setLoading(false);
      return;
    }

    const membershipIds = new Set(
      (membershipsResult.data || []).map((membership) => membership.document_id),
    );
    setDocuments([...((documentsResult.data || []) as Document[]), ...lockedDocuments].filter((document) =>
      document.origin !== 'catalog_import' || membershipIds.has(document.id)
    ));
    setLoading(false);
  }, [user]);

  useEffect(() => {
    if (!user) {
      setDocuments([]);
      setLoading(true);
      return;
    }
    fetchDocuments();
  }, [user, fetchDocuments]);

  return { documents, loading, refetch: fetchDocuments };
}

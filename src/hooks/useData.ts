import { useEffect, useState, useCallback, useRef } from 'react';
import { supabase, Document, Bookmark, ReadingProgress, ReadingListItem } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';
import { attachLockedDocumentReferences } from '@/services/lockedDocumentReferences';

async function fetchLockedDocumentReferences(): Promise<Document[]> {
  const { data, error } = await supabase.rpc('get_locked_user_upload_references');
  if (error) {
    console.error('Failed to load locked document references:', error);
    return [];
  }
  return (data ?? []) as Document[];
}

const readingProgressFetches = new Map<string, Promise<ReadingProgress[]>>();

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
  const [progress, setProgress] = useState<ReadingProgress[]>([]);
  const progressRef = useRef(progress);
  progressRef.current = progress;
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!user) return;
    let request = readingProgressFetches.get(user.id);
    if (!request) {
      request = (async () => {
        const { data, error } = await supabase
          .from('reading_progress')
          .select('*')
          .eq('user_id', user.id);
        if (error) throw error;
        return (data || []) as ReadingProgress[];
      })();
      readingProgressFetches.set(user.id, request);
      void request.finally(() => {
        if (readingProgressFetches.get(user.id) === request) {
          readingProgressFetches.delete(user.id);
        }
      }).catch(() => {});
    }

    try {
      setProgress(await request);
    } catch (error) {
      console.error('Failed to load reading progress:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const saveProgress = useCallback(
    async (documentId: string, chapterIndex: number, scrollPercent: number, epubCfi?: string) => {
      if (!user) return;
      const existing = progressRef.current.find((p) => p.document_id === documentId);
      const { data, error } = await supabase
        .from('reading_progress')
        .upsert({
          document_id: documentId,
          chapter_index: chapterIndex,
          scroll_percent: scrollPercent,
          epub_cfi: epubCfi ?? existing?.epub_cfi ?? null,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'user_id,document_id' })
        .select('*')
        .single();
      if (error) {
        console.error('Failed to save reading progress:', error);
        return;
      }
      setProgress((prev) => [
        ...prev.filter((item) => item.document_id !== documentId),
        data as ReadingProgress,
      ]);
    },
    [user]
  );

  const getProgress = useCallback(
    (documentId: string): ReadingProgress | undefined =>
      progress.find((p) => p.document_id === documentId),
    [progress]
  );

  return { progress, loading, saveProgress, getProgress, refetch: fetchProgress };
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

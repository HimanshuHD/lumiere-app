import { useEffect, useState, useCallback } from 'react';
import { supabase, Document, Bookmark, ReadingProgress } from '@/lib/supabase';
import { useAuth } from '@/context/AuthContext';

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
      setBookmarks(data as unknown as Bookmark[]);
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
  const [loading, setLoading] = useState(true);

  const fetchProgress = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('reading_progress')
      .select('*')
      .eq('user_id', user.id);
    if (!error && data) {
      setProgress(data as ReadingProgress[]);
    }
    setLoading(false);
  }, [user]);

  useEffect(() => {
    fetchProgress();
  }, [fetchProgress]);

  const saveProgress = useCallback(
    async (documentId: string, chapterIndex: number, scrollPercent: number) => {
      if (!user) return;
      const existing = progress.find((p) => p.document_id === documentId);
      if (existing) {
        const { error } = await supabase
          .from('reading_progress')
          .update({
            chapter_index: chapterIndex,
            scroll_percent: scrollPercent,
            updated_at: new Date().toISOString(),
          })
          .eq('id', existing.id);
        if (!error) {
          setProgress((prev) =>
            prev.map((p) =>
              p.id === existing.id
                ? { ...p, chapter_index: chapterIndex, scroll_percent: scrollPercent }
                : p
            )
          );
        }
      } else {
        const { data, error } = await supabase
          .from('reading_progress')
          .insert({
            document_id: documentId,
            chapter_index: chapterIndex,
            scroll_percent: scrollPercent,
          })
          .select('*')
          .single();
        if (!error && data) {
          setProgress((prev) => [...prev, data as ReadingProgress]);
        }
      }
    },
    [user, progress]
  );

  const getProgress = useCallback(
    (documentId: string): ReadingProgress | undefined =>
      progress.find((p) => p.document_id === documentId),
    [progress]
  );

  return { progress, loading, saveProgress, getProgress, refetch: fetchProgress };
}

export function useDocuments() {
  const { user } = useAuth();
  const [documents, setDocuments] = useState<Document[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!user) return;
    const { data, error } = await supabase
      .from('documents')
      .select('*')
      .order('created_at', { ascending: true });
    if (!error && data) {
      setDocuments(data as Document[]);
    }
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

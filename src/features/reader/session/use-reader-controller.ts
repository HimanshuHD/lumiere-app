import { useState, useRef, useEffect, useCallback } from 'react';
import { useIntegrations } from '@/shared/integrations';
import type { Document } from '@/domain/documents';
import type { ReaderPosition } from '@/domain/reading-position';
import { legacyPosition, textPosition } from '@/domain/reading-position';
import { useBookmarks, useReadingProgress, useReadingList } from '@/hooks/useData';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';
import { useAuth } from '@/features/auth';
import { useToast } from '@/shared/ui';
import { isDocumentLockedForUser } from '@/lib/documentAccess';
import { useEpubController } from '@/features/reader/epub';
import { useTextController } from '@/features/reader/text';
import { loadSettings, saveSettings, themeMap, type ReaderSettings } from '@/features/reader/preferences';
function isTextDoc(doc: Document): boolean {
  if (doc.file_format === 'pdf' || doc.file_format === 'epub') return false;
  return doc.file_format === 'txt' ||
    (!doc.file_storage_path && !doc.file_url && doc.chapters.length > 0 && doc.chapters[0]?.content.length > 200);
}

export function useReaderController(doc: Document) {
  const { preferences } = useIntegrations();
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings(preferences));
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);

  const [positionReady, setPositionReady] = useState(false);
  const textRestoreRef = useRef({ chapterIndex: 0, chapterProgress: 0 });
  const initialPositionRef = useRef<ReaderPosition | null>(null);
  const initialLegacyProgressRef = useRef(0);

  const { toggleBookmark, isBookmarked, isBookmarkPending } = useBookmarks();
  const { savePosition, getProgress, loading: progressLoading, error: progressError,
    refetch: retryLoadProgress, flushProgress, getSaveState, retryProgress } = useReadingProgress();
  const { removeFromReadingList } = useReadingList();
  const { user } = useAuth();
  const { showToast } = useToast();
  const locked = isDocumentLockedForUser(doc, user?.id);
  const { url: fileUrl, error: fileAccessError } = useDocumentStorageUrl(doc.file_storage_path, doc.file_url, !locked);

  const theme = themeMap[settings.theme];
  const textMode = isTextDoc(doc);

  const onTextPosition = useCallback((position: Extract<ReaderPosition, {format: 'txt'}>, progress: number) => {
    savePosition(doc.id, position, position.chapterIndex, progress);
  }, [doc.id, savePosition]);
  const onTextFlush = useCallback(() => { void flushProgress(doc.id); }, [doc.id, flushProgress]);
  const { chapterIndex, setChapterIndex, setScrollPercent, contentRef, toolbarRef,
    textReady, goToChapter: changeChapter, prevChapter, nextChapter, totalProgress } = useTextController(
      doc.chapters.length, !locked && textMode, positionReady, textRestoreRef, onTextPosition, onTextFlush);
  const goToChapter = (index: number) => { changeChapter(index); setShowToc(false); };
  const chapter = doc.chapters[chapterIndex];

  // Restore once per document session. Save acknowledgements must not re-run restoration.
  useEffect(() => {
    if (locked || progressLoading || progressError || positionReady) return;
    const row = getProgress(doc.id);
    const pending = getSaveState(doc.id)?.pending;
    const position = pending?.position ?? legacyPosition(doc.file_format, row);
    initialPositionRef.current = position;
    initialLegacyProgressRef.current = Number(row?.scroll_percent) || 0;
    const text = textPosition(position, doc.chapters.length);
    textRestoreRef.current = text;
    setChapterIndex(text.chapterIndex);
    setScrollPercent(text.chapterProgress);
    if (!row && !pending) void removeFromReadingList(doc.id).catch(error => showToast(error instanceof Error ? error.message : 'Could not update the reading list.', 'error'));
    setPositionReady(true);
  }, [doc.id, doc.file_format, doc.chapters.length, getProgress, getSaveState, locked,
    progressLoading, progressError, positionReady, removeFromReadingList, showToast, setChapterIndex, setScrollPercent]);

  useEffect(() => () => { void flushProgress(doc.id); }, [doc.id, flushProgress]);


  // Persist settings
  useEffect(() => {
    const result = saveSettings(settings, preferences);
    if (!result.ok) showToast("Reader preferences could not be saved on this device.", "error");
  }, [settings, showToast, preferences]);

  const onEpubPosition = useCallback((position: Extract<ReaderPosition, { format: 'epub' }>) => {
    savePosition(doc.id, position, 0, position.approximateProgress);
  }, [doc.id, savePosition]);
  const { epubLoading, epubError, setEpubLoadAttempt, epubPosition, epubAtStart, epubAtEnd,
    epubViewerRef, epubPositionWarning, turnEpubPage } = useEpubController(fileUrl,
      !locked && positionReady && !progressLoading && !textMode && doc.file_format === 'epub', initialPositionRef.current, onEpubPosition);

  const handleBookmark = async () => {
    if (locked) return;
    const result = await toggleBookmark(doc.id);
    if (!result.ok) showToast(result.error.message, 'error');
  };

  const onPdfPosition = (position: Extract<ReaderPosition, {format: 'pdf'}>, percent: number) => savePosition(doc.id, position, 0, percent);
  return { settings, setSettings, showSettings, setShowSettings, showToc, setShowToc, positionReady, initialPositionRef, initialLegacyProgressRef, isBookmarked, isBookmarkPending, onPdfPosition, progressLoading, progressError, retryLoadProgress, getSaveState, retryProgress, locked, fileUrl, fileAccessError, theme, textMode, chapterIndex, contentRef, toolbarRef, textReady, prevChapter, nextChapter, totalProgress, goToChapter, chapter, epubLoading, epubError, setEpubLoadAttempt, epubPosition, epubAtStart, epubAtEnd, epubViewerRef, epubPositionWarning, turnEpubPage, handleBookmark };
}

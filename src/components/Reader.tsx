import { useState, useRef, useEffect, useCallback } from 'react';
import {
  ArrowLeft,
  ChevronLeft,
  ChevronRight,
  Bookmark,
  BookmarkCheck,
  Settings,
  List,
  X,
  Type,
  Moon,
  Sun,
  ScrollText,
} from 'lucide-react';
import { Document, ReadingProgress } from '@/lib/supabase';
import type { Location as EpubLocation } from 'epubjs';
import { useBookmarks, useReadingProgress, useReadingList } from '@/hooks/useData';
import {
  ReaderSettings,
  FontSize,
  ReadingTheme,
  LineSpacing,
  loadSettings,
  saveSettings,
  fontSizeMap,
  lineHeightMap,
  themeMap,
} from '@/lib/settings';
import { PdfViewer } from '@/components/PdfViewer';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';
import type EpubBook from 'epubjs/types/book';
import type EpubRendition from 'epubjs/types/rendition';

interface ReaderProps {
  document: Document;
  onBack: () => void;
}

function isTextDoc(doc: Document): boolean {
  if (doc.file_format === 'pdf' || doc.file_format === 'epub') return false;
  return doc.file_format === 'txt' ||
    (!doc.file_storage_path && !doc.file_url && doc.chapters.length > 0 && doc.chapters[0]?.content.length > 200);
}

const epubFileRequests = new Map<string, Promise<ArrayBuffer>>();

function fetchEpubFile(url: string): Promise<ArrayBuffer> {
  const existingRequest = epubFileRequests.get(url);
  if (existingRequest) return existingRequest;

  const request = fetch(url).then(async (response) => {
    if (!response.ok) {
      throw new Error(`Could not load the saved book file (${response.status}).`);
    }
    const data = await response.arrayBuffer();
    const bytes = new Uint8Array(data);
    if (bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
      throw new Error('The saved file is not a valid EPUB archive. Try removing it and adding it again from the catalog.');
    }
    return data;
  });
  epubFileRequests.set(url, request);
  void request.finally(() => {
    if (epubFileRequests.get(url) === request) epubFileRequests.delete(url);
  }).catch(() => {});
  return request;
}

export function Reader({ document: doc, onBack }: ReaderProps) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [chapterIndex, setChapterIndex] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [localBookmarked, setLocalBookmarked] = useState(false);
  const [epubLoading, setEpubLoading] = useState(false);
  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubLoadAttempt, setEpubLoadAttempt] = useState(0);
  const [epubPosition, setEpubPosition] = useState({ page: 1, total: 1 });
  const [epubAtStart, setEpubAtStart] = useState(true);
  const [epubAtEnd, setEpubAtEnd] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const epubViewerRef = useRef<HTMLDivElement>(null);
  const epubRenditionRef = useRef<EpubRendition | null>(null);
  const epubProgressRef = useRef<ReadingProgress | undefined>(undefined);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toggleBookmark, isBookmarked } = useBookmarks();
  const { saveProgress, getProgress, loading: progressLoading } = useReadingProgress();
  const { removeFromReadingList } = useReadingList();
  const { url: fileUrl, error: fileAccessError } = useDocumentStorageUrl(doc.file_storage_path, doc.file_url);

  const theme = themeMap[settings.theme];
  const textMode = isTextDoc(doc);

  // Load saved progress on mount
  useEffect(() => {
    if (progressLoading) return;

    const prog = getProgress(doc.id);
    epubProgressRef.current = prog;
    if (prog) {
      setChapterIndex(prog.chapter_index);
      setScrollPercent(prog.scroll_percent);
    } else {
      setChapterIndex(0);
      setScrollPercent(0);
      void removeFromReadingList(doc.id);
    }
    setLocalBookmarked(isBookmarked(doc.id));
  }, [doc.id, getProgress, progressLoading, saveProgress, removeFromReadingList]);

  useEffect(() => {
    setLocalBookmarked(isBookmarked(doc.id));
  }, [doc.id, isBookmarked]);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // EPUB rendering
  useEffect(() => {
    if (progressLoading || textMode || doc.file_format !== 'epub' || !fileUrl || !epubViewerRef.current) return;

    const container = epubViewerRef.current;
    let cancelled = false;
    let rendition: EpubRendition | undefined;
    let book: EpubBook | undefined;
    let pendingPosition: { percentage: number; cfi: string } | undefined;
    let progressSaveTimer: ReturnType<typeof setTimeout> | undefined;

    const savePendingPosition = () => {
      if (progressSaveTimer) clearTimeout(progressSaveTimer);
      progressSaveTimer = undefined;
      if (!pendingPosition) return;
      const position = pendingPosition;
      pendingPosition = undefined;
      void saveProgress(doc.id, 0, position.percentage, position.cfi);
    };

    setEpubLoading(true);
    setEpubError(null);
    setEpubAtStart(true);
    setEpubAtEnd(false);
    setEpubPosition({ page: 1, total: 1 });
    container.replaceChildren();

    const loadEpub = async () => {
      try {
        const data = await fetchEpubFile(fileUrl);

        const ePub = (await import('epubjs')).default;
        if (cancelled) return;
        book = ePub(data);
        await book.ready;
        if (cancelled) return;
        const spine = await book.loaded.spine;

        rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
        });
        epubRenditionRef.current = rendition;
        rendition.on('relocated', (location: EpubLocation) => {
          setEpubAtStart(location.atStart);
          setEpubAtEnd(location.atEnd);
          setEpubPosition({
            page: location.start.displayed.page,
            total: location.start.displayed.total,
          });
          const pages = Math.max(1, location.start.displayed.total);
          const sectionProgress = Math.max(0, (location.start.displayed.page - 1) / pages);
          pendingPosition = {
            percentage: Math.min(1, Math.max(0, (location.start.index + sectionProgress) / Math.max(1, spine.length))),
            cfi: location.start.cfi,
          };
          if (progressSaveTimer) clearTimeout(progressSaveTimer);
          progressSaveTimer = setTimeout(savePendingPosition, 750);
        });
        window.addEventListener('pagehide', savePendingPosition);
        await rendition.display(epubProgressRef.current?.epub_cfi || undefined);
        if (!cancelled) setEpubLoading(false);
      } catch (err) {
        if (cancelled) return;
        setEpubError(err instanceof Error ? err.message : 'Could not open this EPUB file.');
        setEpubLoading(false);
      }
    };

    void loadEpub();

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', savePendingPosition);
      if (progressSaveTimer) clearTimeout(progressSaveTimer);
      savePendingPosition();
      if (epubRenditionRef.current === rendition) epubRenditionRef.current = null;
      rendition?.destroy();
      book?.destroy();
    };
  }, [doc.id, fileUrl, doc.file_format, textMode, epubLoadAttempt, progressLoading, saveProgress]);

  const turnEpubPage = useCallback(async (direction: 'previous' | 'next') => {
    const rendition = epubRenditionRef.current;
    if (!rendition) return;
    try {
      if (direction === 'previous') await rendition.prev();
      else await rendition.next();
    } catch (err) {
      setEpubError(err instanceof Error ? err.message : 'Could not turn the EPUB page.');
    }
  }, []);

  // Scroll tracking + progress saving (text mode only)
  useEffect(() => {
    if (!textMode) return;
    const handleScroll = () => {
      const el = contentRef.current;
      if (!el) return;
      const scrollTop = window.scrollY;
      const docHeight = el.scrollHeight - window.innerHeight;
      const percent = docHeight > 0 ? Math.min(scrollTop / docHeight, 1) : 0;
      setScrollPercent(percent);

      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
      scrollTimerRef.current = setTimeout(() => {
        saveProgress(doc.id, chapterIndex, percent);
      }, 2000);
    };

    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => {
      window.removeEventListener('scroll', handleScroll);
      if (scrollTimerRef.current) clearTimeout(scrollTimerRef.current);
    };
  }, [doc.id, chapterIndex, saveProgress, textMode]);

  const handleBookmark = async () => {
    const result = await toggleBookmark(doc.id);
    setLocalBookmarked(result);
  };

  const goToChapter = useCallback((idx: number) => {
    setChapterIndex(idx);
    setScrollPercent(0);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setShowToc(false);
  }, []);

  const prevChapter = () => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1);
  };

  const nextChapter = () => {
    if (chapterIndex < doc.chapters.length - 1) goToChapter(chapterIndex + 1);
  };

  const chapter = doc.chapters[chapterIndex];
  const totalProgress = ((chapterIndex + scrollPercent) / doc.chapters.length) * 100;

  return (
    <div className={`${theme.bg} transition-colors duration-300 min-h-screen`}>
      {/* Reader toolbar (sits below main app nav) */}
      <div className={`sticky top-16 z-30 ${theme.headerBg} backdrop-blur-md border-b ${theme.border} transition-colors duration-300`}>
        <div className="max-w-4xl mx-auto px-4 h-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {textMode && (
              <button
                onClick={() => setShowToc(true)}
                className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
              >
                <List className="w-4 h-4" />
              </button>
            )}
          </div>

          <div className={`text-sm font-medium ${theme.subText} truncate max-w-[200px]`}>
            {doc.title}
          </div>

          <div className="flex items-center gap-1">
            <button
              onClick={handleBookmark}
              className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
            >
              {localBookmarked ? (
                <BookmarkCheck className="w-4 h-4 text-amber-600" />
              ) : (
                <Bookmark className="w-4 h-4" />
              )}
            </button>
            {textMode && (
              <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        {/* Progress Bar */}
        <div className={`h-0.5 ${theme.border} border-t`}>
          <div
            className="h-full bg-amber-600 transition-all duration-150"
            style={{ width: textMode ? `${totalProgress}%` : '100%' }}
          />
        </div>
      </div>

      {/* Settings Panel (text mode only) */}
      {textMode && showSettings && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setShowSettings(false)}
        >
          <div className={`absolute top-28 right-4 w-72 ${theme.cardBg} border ${theme.border} rounded-xl shadow-2xl p-5 z-50`} onClick={(e) => e.stopPropagation()}>
            <div className="space-y-5">
              {/* Font Size */}
              <div>
                <label className={`flex items-center gap-2 text-xs font-medium ${theme.subText} uppercase tracking-wide mb-2`}>
                  <Type className="w-3.5 h-3.5" />
                  Font Size
                </label>
                <div className="flex gap-1.5">
                  {(['small', 'medium', 'large'] as FontSize[]).map((size) => (
                    <button
                      key={size}
                      onClick={() => setSettings({ ...settings, fontSize: size })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                        settings.fontSize === size
                          ? 'bg-amber-600 text-white'
                          : `${theme.text} hover:bg-stone-200/50`
                      } ${theme.border} border`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>

              {/* Theme */}
              <div>
                <label className={`flex items-center gap-2 text-xs font-medium ${theme.subText} uppercase tracking-wide mb-2`}>
                  Theme
                </label>
                <div className="flex gap-1.5">
                  {([
                    { key: 'light' as ReadingTheme, icon: Sun, label: 'Light' },
                    { key: 'sepia' as ReadingTheme, icon: ScrollText, label: 'Sepia' },
                    { key: 'dark' as ReadingTheme, icon: Moon, label: 'Dark' },
                  ]).map(({ key, icon: Icon, label }) => (
                    <button
                      key={key}
                      onClick={() => setSettings({ ...settings, theme: key })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all flex items-center justify-center gap-1.5 ${
                        settings.theme === key
                          ? 'bg-amber-600 text-white'
                          : `${theme.text} hover:bg-stone-200/50`
                      } ${theme.border} border`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Line Spacing */}
              <div>
                <label className={`text-xs font-medium ${theme.subText} uppercase tracking-wide mb-2`}>
                  Line Spacing
                </label>
                <div className="flex gap-1.5">
                  {(['comfortable', 'compact'] as LineSpacing[]).map((spacing) => (
                    <button
                      key={spacing}
                      onClick={() => setSettings({ ...settings, lineSpacing: spacing })}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium capitalize transition-all ${
                        settings.lineSpacing === spacing
                          ? 'bg-amber-600 text-white'
                          : `${theme.text} hover:bg-stone-200/50`
                      } ${theme.border} border`}
                    >
                      {spacing}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TOC Drawer (text mode only) */}
      {textMode && showToc && (
        <div className="fixed inset-0 z-50" onClick={() => setShowToc(false)}>
          <div className="absolute inset-0 bg-black/30" />
          <div
            className={`absolute left-0 top-0 bottom-0 w-80 ${theme.sidebarBg} border-r ${theme.border} shadow-2xl overflow-y-auto`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className={`p-4 border-b ${theme.border} flex items-center justify-between`}>
              <h3 className={`font-serif font-bold ${theme.text} text-lg`}>Contents</h3>
              <button onClick={() => setShowToc(false)} className={`p-1.5 rounded-lg hover:bg-stone-200/50 ${theme.text}`}>
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-2">
              {/* Document info at top */}
              <div className={`px-3 py-3 mb-2 border-b ${theme.border} pb-3`}>
                <p className={`font-serif font-bold ${theme.text} text-sm`}>{doc.title}</p>
                <p className={`text-xs ${theme.subText} mt-0.5`}>{doc.author}</p>
              </div>
              {doc.chapters.map((ch, idx) => (
                <button
                  key={idx}
                  onClick={() => goToChapter(idx)}
                  className={`w-full text-left px-3 py-2.5 rounded-lg text-sm transition-all flex items-center gap-3 ${
                    idx === chapterIndex
                      ? 'bg-amber-600/10 text-amber-700 font-medium'
                      : `${theme.text} hover:bg-stone-200/50`
                  }`}
                >
                  <span className={`text-xs ${theme.subText} font-mono w-5`}>
                    {String(idx + 1).padStart(2, '0')}
                  </span>
                  <span className="flex-1 line-clamp-2 leading-snug">{ch.title}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PDF Reader (pdfjs-dist canvas) */}
      {!textMode && doc.file_format === 'pdf' && !progressLoading && (
        <div className="max-w-5xl mx-auto px-4 sm:px-6">
          {fileUrl ? (
            <PdfViewer
              url={fileUrl}
              title={doc.title}
              initialProgress={getProgress(doc.id)?.scroll_percent ?? 0}
              onProgress={(percent) => saveProgress(doc.id, 0, percent)}
            />
          ) : (
            <p className="py-12 text-center text-sm text-stone-500">
              {fileAccessError || (!doc.file_storage_path && !doc.file_url
                ? 'The original document file is unavailable. Contact an administrator for help.'
                : 'Preparing secure document access...')}
            </p>
          )}
        </div>
      )}

      {/* EPUB Reader (epub.js) */}
      {!textMode && doc.file_format === 'epub' && (
        <div className="relative h-[calc(100vh-7rem)]">
          {fileUrl && <div ref={epubViewerRef} className="w-full h-full" />}
          {!fileUrl && (
            <p className="py-12 text-center text-sm text-stone-500">
              {fileAccessError || (!doc.file_storage_path && !doc.file_url
                ? 'The original document file is unavailable. Contact an administrator for help.'
                : 'Preparing secure document access...')}
            </p>
          )}
          {fileUrl && !epubLoading && !epubError && (
            <>
              <button
                onClick={() => void turnEpubPage('previous')}
                disabled={epubAtStart}
                aria-label="Previous EPUB page"
                className="absolute left-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 sm:left-6"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => void turnEpubPage('next')}
                disabled={epubAtEnd}
                aria-label="Next EPUB page"
                className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-full border border-stone-200 bg-white/90 p-2 text-stone-700 shadow-md transition hover:bg-white disabled:cursor-not-allowed disabled:opacity-40 sm:right-6"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-3 left-1/2 z-10 -translate-x-1/2 rounded-full bg-white/90 px-3 py-1 text-xs text-stone-500 shadow">
                Page {epubPosition.page} of {epubPosition.total}
              </div>
            </>
          )}
          {epubLoading && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-white">
              <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
              <p className="text-sm text-stone-500">Loading EPUB...</p>
            </div>
          )}
          {epubError && (
            <div className="absolute inset-0 flex items-center justify-center bg-white px-6">
              <div className="max-w-md text-center">
                <p className="mb-2 text-sm font-medium text-red-600">Could not open this EPUB</p>
                <p className="mb-4 text-xs text-stone-500">{epubError}</p>
                <button
                  onClick={() => setEpubLoadAttempt((attempt) => attempt + 1)}
                  className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-amber-500"
                >
                  Try again
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Text Content (TXT files) */}
      {textMode && (
        <div ref={contentRef} className={`pt-8 pb-24 ${theme.bg} transition-colors duration-300`}>
          <div className="max-w-2xl mx-auto px-6 sm:px-8">
            {/* Title section (only on first chapter) */}
            {chapterIndex === 0 && (
              <div className="mb-12 text-center pt-4">
                <p className={`text-xs uppercase tracking-widest ${theme.accent} font-medium mb-3`}>
                  {doc.category}
                </p>
                <h1 className={`font-serif font-bold ${theme.text} text-3xl sm:text-4xl tracking-tight mb-3`}>
                  {doc.title}
                </h1>
                <p className={`${theme.subText} text-sm`}>by {doc.author}</p>
                <div className={`w-12 h-px ${theme.border} border-t mx-auto mt-6`} />
              </div>
            )}

            {/* Chapter header */}
            <div className="mb-8">
              <p className={`text-xs uppercase tracking-widest ${theme.subText} font-medium mb-2`}>
                Chapter {chapterIndex + 1} of {doc.chapters.length}
              </p>
              <h2 className={`font-serif font-bold ${theme.text} text-2xl sm:text-3xl tracking-tight`}>
                {chapter.title}
              </h2>
            </div>

            {/* Chapter content */}
            <div
              className={`${theme.text} ${fontSizeMap[settings.fontSize]} ${lineHeightMap[settings.lineSpacing]} transition-all duration-300`}
            >
              {chapter.content.split('\n\n').map((paragraph, i) => (
                <p key={i} className="mb-6 whitespace-pre-line">
                  {paragraph}
                </p>
              ))}
            </div>

            {/* Chapter Navigation */}
            <div className={`mt-16 pt-8 border-t ${theme.border} flex items-center justify-between`}>
              <button
                onClick={prevChapter}
                disabled={chapterIndex === 0}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  chapterIndex === 0
                    ? `opacity-40 cursor-not-allowed ${theme.text}`
                    : `${theme.text} hover:bg-stone-200/50 border ${theme.border}`
                }`}
              >
                <ChevronLeft className="w-4 h-4" />
                Previous
              </button>
              <span className={`text-xs ${theme.subText}`}>
                {chapterIndex + 1} / {doc.chapters.length}
              </span>
              <button
                onClick={nextChapter}
                disabled={chapterIndex === doc.chapters.length - 1}
                className={`flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all ${
                  chapterIndex === doc.chapters.length - 1
                    ? `opacity-40 cursor-not-allowed ${theme.text}`
                    : `${theme.text} hover:bg-stone-200/50 border ${theme.border}`
                }`}
              >
                Next
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            {/* End of book */}
            {chapterIndex === doc.chapters.length - 1 && (
              <div className="mt-12 text-center">
                <div className={`w-12 h-px ${theme.border} border-t mx-auto mb-4`} />
                <p className={`text-sm ${theme.subText} italic`}>The End</p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

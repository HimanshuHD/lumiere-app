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
import { Document } from '@/lib/supabase';
import { useBookmarks, useReadingProgress } from '@/hooks/useData';
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

interface ReaderProps {
  document: Document;
  onBack: () => void;
}

function isTextDoc(doc: Document): boolean {
  return doc.file_format === 'txt' || (!doc.file_url && doc.chapters.length > 0 && doc.chapters[0]?.content.length > 200);
}

export function Reader({ document: doc, onBack }: ReaderProps) {
  const [settings, setSettings] = useState<ReaderSettings>(() => loadSettings());
  const [chapterIndex, setChapterIndex] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [showToc, setShowToc] = useState(false);
  const [localBookmarked, setLocalBookmarked] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const epubViewerRef = useRef<HTMLDivElement>(null);
  const scrollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { toggleBookmark, isBookmarked } = useBookmarks();
  const { saveProgress, getProgress } = useReadingProgress();

  const theme = themeMap[settings.theme];
  const textMode = isTextDoc(doc);

  // Load saved progress on mount
  useEffect(() => {
    const prog = getProgress(doc.id);
    if (prog) {
      setChapterIndex(prog.chapter_index);
      setScrollPercent(prog.scroll_percent);
    }
    setLocalBookmarked(isBookmarked(doc.id));
  }, [doc.id]);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // EPUB rendering
  useEffect(() => {
    if (textMode || doc.file_format !== 'epub' || !doc.file_url || !epubViewerRef.current) return;

    let rendition: any = null;
    let book: any = null;

    (async () => {
      const ePub = (await import('epubjs')).default;
      book = ePub(doc.file_url!);
      rendition = book.renderTo(epubViewerRef.current!, {
        width: '100%',
        height: '100%',
      });
      rendition.display();
    })();

    return () => {
      if (rendition) rendition.destroy();
      if (book) book.destroy();
    };
  }, [doc.file_url, doc.file_format, textMode]);

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
    <div className={`min-h-screen ${theme.bg} transition-colors duration-300`}>
      {/* Progress Bar */}
      <div className="fixed top-0 left-0 right-0 h-1 bg-stone-200/50 z-50">
        <div
          className="h-full bg-amber-600 transition-all duration-150"
          style={{ width: textMode ? `${totalProgress}%` : '100%' }}
        />
      </div>

      {/* Header */}
      <header className={`fixed top-0 left-0 right-0 ${theme.headerBg} backdrop-blur-md border-b ${theme.border} z-40 transition-colors duration-300`}>
        <div className="max-w-4xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={onBack}
              className={`p-2 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
            {textMode && (
              <button
                onClick={() => setShowToc(true)}
                className={`p-2 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
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
              className={`p-2 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
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
                className={`p-2 rounded-lg hover:bg-stone-200/50 ${theme.text} transition-colors`}
              >
                <Settings className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Settings Panel (text mode only) */}
      {textMode && showSettings && (
        <div
          className="fixed inset-0 z-50"
          onClick={() => setShowSettings(false)}
        >
          <div className={`absolute top-14 right-4 w-72 ${theme.cardBg} border ${theme.border} rounded-xl shadow-2xl p-5 z-50`} onClick={(e) => e.stopPropagation()}>
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

      {/* PDF Reader (native browser embed) */}
      {!textMode && doc.file_format === 'pdf' && doc.file_url && (
        <div className="pt-14 h-screen">
          <iframe
            src={`${doc.file_url}#view=FitH&toolbar=1`}
            title={doc.title}
            className="w-full h-[calc(100vh-3.5rem)] border-0"
          />
        </div>
      )}

      {/* EPUB Reader (epub.js) */}
      {!textMode && doc.file_format === 'epub' && doc.file_url && (
        <div className="pt-14 h-screen">
          <div ref={epubViewerRef} className="w-full h-[calc(100vh-3.5rem)]" />
        </div>
      )}

      {/* Text Content (TXT files) */}
      {textMode && (
        <div ref={contentRef} className={`pt-20 pb-24 ${theme.bg} transition-colors duration-300`}>
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

import { useState, useRef, useEffect, useLayoutEffect, useCallback, type MutableRefObject } from 'react';
import type { ReaderPosition } from '@/domain/reading-position';
import { textScrollRange, textScrollProgress } from './scroll';
export function useTextController(chapterCount: number, enabled: boolean, positionReady: boolean, textRestoreRef: MutableRefObject<{chapterIndex: number; chapterProgress: number}>,
  onPosition: (position: Extract<ReaderPosition, {format: 'txt'}>, progress: number) => void, onFlush: () => void) {
  const [chapterIndex, setChapterIndex] = useState(0);
  const [scrollPercent, setScrollPercent] = useState(0);
  const [textReady, setTextReady] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);
  const toolbarRef = useRef<HTMLDivElement>(null);
  const textTrackingRef = useRef(false);
  const getTextRange = useCallback(() => {
    const el = contentRef.current;
    if (!el) return { start: 0, length: 0 };
    return textScrollRange(el.getBoundingClientRect().top + window.scrollY, el.scrollHeight,
      window.innerHeight, window.document.documentElement.scrollHeight, toolbarRef.current?.getBoundingClientRect().bottom ?? 112);
  }, []);

  // Layout must exist before restoring; suppress scroll-generated saves until finished.
  useLayoutEffect(() => {
    if (!enabled || !positionReady || chapterCount === 0) return;
    let cancelled = false;
    let frame = 0;
    textTrackingRef.current = false;
    setTextReady(false);
    void window.document.fonts.ready.then(() => {
      if (cancelled) return;
      frame = requestAnimationFrame(() => {
        const range = getTextRange();
        window.scrollTo({ top: range.start + range.length * textRestoreRef.current.chapterProgress, behavior: 'instant' });
        frame = requestAnimationFrame(() => {
          if (cancelled) return;
          textTrackingRef.current = true;
          setTextReady(true);
        });
      });
    });
    return () => { cancelled = true; cancelAnimationFrame(frame); textTrackingRef.current = false; };
  }, [chapterIndex, chapterCount, getTextRange, enabled, positionReady, textRestoreRef]);

  useEffect(() => {
    if (!enabled || !textReady || chapterCount === 0) return;
    const handleScroll = () => {
      if (!textTrackingRef.current) return;
      const percent = textScrollProgress(window.scrollY, getTextRange());
      textRestoreRef.current = { chapterIndex, chapterProgress: percent };
      setScrollPercent(percent);
      onPosition({ version: 1, format: 'txt', chapterIndex, chapterProgress: percent }, (chapterIndex + percent) / chapterCount);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => { window.removeEventListener('scroll', handleScroll); };
  }, [chapterCount, chapterIndex, getTextRange, enabled, onPosition, textReady, textRestoreRef]);

  const goToChapter = useCallback((idx: number) => {
    if (!positionReady || idx < 0 || idx >= chapterCount || idx === chapterIndex) { return; }
    onFlush();
    textTrackingRef.current = false;
    textRestoreRef.current = { chapterIndex: idx, chapterProgress: 0 };
    setTextReady(false);
    setChapterIndex(idx);
    setScrollPercent(0);
    onPosition({ version: 1, format: 'txt', chapterIndex: idx, chapterProgress: 0 }, idx / chapterCount);
  }, [chapterIndex, chapterCount, onFlush, positionReady, onPosition, textRestoreRef]);

  const prevChapter = () => {
    if (chapterIndex > 0) goToChapter(chapterIndex - 1);
  };

  const nextChapter = () => {
    if (chapterIndex < chapterCount - 1) goToChapter(chapterIndex + 1);
  };

  const totalProgress = chapterCount ? ((chapterIndex + scrollPercent) / chapterCount) * 100 : 0;
  return { chapterIndex, setChapterIndex, scrollPercent, setScrollPercent, contentRef, toolbarRef, textReady, goToChapter, prevChapter, nextChapter, totalProgress };
}

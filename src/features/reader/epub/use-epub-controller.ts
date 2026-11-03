import { useState, useRef, useEffect, useCallback } from 'react';
import type { Location as EpubLocation } from 'epubjs';
import type EpubBook from 'epubjs/types/book';
import type EpubRendition from 'epubjs/types/rendition';
import type { ReaderPosition } from '@/domain/reading-position';
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

export function useEpubController(fileUrl: string | null, enabled: boolean, initialPosition: ReaderPosition | null,
  onPosition: (position: Extract<ReaderPosition, { format: 'epub' }>) => void) {
  const [epubLoading, setEpubLoading] = useState(false);
  const [epubError, setEpubError] = useState<string | null>(null);
  const [epubLoadAttempt, setEpubLoadAttempt] = useState(0);
  const [epubPosition, setEpubPosition] = useState({ page: 1, total: 1 });
  const [epubAtStart, setEpubAtStart] = useState(true);
  const [epubAtEnd, setEpubAtEnd] = useState(false);
  const epubViewerRef = useRef<HTMLDivElement>(null);
  const epubRenditionRef = useRef<EpubRendition | null>(null);
  const epubInteractionRef = useRef(false);
  const epubLocationRef = useRef<Extract<ReaderPosition, { format: 'epub' }> | null>(null);
  const [epubPositionWarning, setEpubPositionWarning] = useState<string | null>(null);
  // EPUB rendering
  useEffect(() => {
    if (!enabled || !fileUrl || !epubViewerRef.current) return;

    if (!epubLocationRef.current && initialPosition?.format === 'epub') epubLocationRef.current = initialPosition;
    const container = epubViewerRef.current;
    let cancelled = false;
    let rendition: EpubRendition | undefined;
    let book: EpubBook | undefined;
    let restorationComplete = false;
    epubInteractionRef.current = false;

    setEpubLoading(true);
    setEpubError(null);
    setEpubPositionWarning(null);
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
        if (cancelled) return;

        rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
        });
        epubRenditionRef.current = rendition;
        rendition.on('click', () => { epubInteractionRef.current = true; });
        rendition.on('relocated', (location: EpubLocation) => {
          if (cancelled) return;
          setEpubAtStart(location.atStart);
          setEpubAtEnd(location.atEnd);
          setEpubPosition({
            page: location.start.displayed.page,
            total: location.start.displayed.total,
          });
          const pages = Math.max(1, location.start.displayed.total);
          const sectionProgress = Math.max(0, (location.start.displayed.page - 1) / pages);
          const position: Extract<ReaderPosition, { format: 'epub' }> = {
            version: 1, format: 'epub', cfi: location.start.cfi,
            approximateProgress: location.atEnd ? 1 : Math.min(1, Math.max(0, (location.start.index + sectionProgress) / Math.max(1, spine.length))),
          };
          epubLocationRef.current = position;
          if (restorationComplete && epubInteractionRef.current) onPosition(position);
        });
        const savedCfi = epubLocationRef.current?.cfi;
        try {
          await rendition.display(savedCfi || undefined);
        } catch (error) {
          if (cancelled) return;
          if (!savedCfi) throw error;
          setEpubPositionWarning('The saved location is unavailable. Opened the beginning of this book.');
          await rendition.display();
        }
        restorationComplete = true;
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
      if (epubRenditionRef.current === rendition) epubRenditionRef.current = null;
      rendition?.destroy();
      book?.destroy();
    };
  }, [fileUrl, enabled, epubLoadAttempt, onPosition, initialPosition]);

  const turnEpubPage = useCallback(async (direction: 'previous' | 'next') => {
    const rendition = epubRenditionRef.current;
    if (!rendition) return;
    try {
      epubInteractionRef.current = true;
      if (direction === 'previous') await rendition.prev();
      else await rendition.next();
    } catch (err) {
      setEpubError(err instanceof Error ? err.message : 'Could not turn the EPUB page.');
    }
  }, []);

  return { epubLoading, epubError, setEpubLoadAttempt, epubPosition, epubAtStart, epubAtEnd, epubViewerRef, epubPositionWarning, turnEpubPage };
}

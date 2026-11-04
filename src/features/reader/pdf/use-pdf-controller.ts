import { useState, useRef, useEffect } from 'react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { parsePosition, fraction } from '@/domain/reading-position';
import type { ReaderPosition } from '@/domain/reading-position';
import { PdfSession } from './pdf-session';
import { PdfRenderQueue } from './pdf-render-queue';

export interface PdfViewerProps {
  url: string;
  title: string;
  initialProgress?: number;
  initialPosition?: ReaderPosition | null;
  onPositionChange?: (position: Extract<ReaderPosition, { format: 'pdf' }>, percent: number) => void;
}

export function usePdfController({ url, initialProgress = 0, initialPosition, onPositionChange }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const canvasAreaRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderQueueRef = useRef<PdfRenderQueue | null>(null);
  const initialPositionRef = useRef(parsePosition(initialPosition));
  const initialPdf = initialPositionRef.current?.format === 'pdf' ? initialPositionRef.current : null;
  const initialScale = initialPdf?.view.mode === 'manual' ? initialPdf.view.scale : 1.2;
  const onPositionRef = useRef(onPositionChange);
  const initialProgressRef = useRef(initialProgress);
  const currentPageRef = useRef(1);
  const hasLoadedPdfRef = useRef(false);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [manualScale, setManualScale] = useState(initialScale);
  const [displayScale, setDisplayScale] = useState(initialScale);
  const [fitMode, setFitMode] = useState<'width' | 'manual'>(initialPdf?.view.mode ?? 'width');
  const requestedZoomRef = useRef({ mode: (initialPdf?.view.mode ?? 'width') as 'width' | 'manual', scale: initialScale });
  const [availableWidth, setAvailableWidth] = useState(0);
  const fitWidth = fitMode === 'width' ? availableWidth : undefined;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [renderAttempt, setRenderAttempt] = useState(0);

  useEffect(() => {
    onPositionRef.current = onPositionChange;
  }, [onPositionChange]);

  // Load PDF document
  useEffect(() => {
    let active = true;
    const session = new PdfSession((error) => console.error('PDF cleanup failed:', error));
    const renderQueue = new PdfRenderQueue();
    renderQueueRef.current = renderQueue;

    (async () => {
      setLoading(true);
      setError(null);
      setRenderError(null);
      setRendering(false);
      try {
        const pdfjsLib = await import('pdfjs-dist');
        // Set worker path
        pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
          'pdfjs-dist/build/pdf.worker.min.mjs',
          import.meta.url
        ).toString();

        const pdf = await session.load(() => pdfjsLib.getDocument(url));
        if (!pdf || !active) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        const boundedCurrentPage = Math.min(Math.max(1, currentPageRef.current), pdf.numPages);
        const boundedProgress = fraction(initialProgressRef.current);
        const initialSaved = initialPositionRef.current;
        const restoredPage = hasLoadedPdfRef.current
          ? boundedCurrentPage
          : initialSaved?.format === 'pdf'
            ? Math.min(initialSaved.page, pdf.numPages)
            : pdf.numPages === 1
            ? 1
            : Math.round(boundedProgress * (pdf.numPages - 1)) + 1;
        hasLoadedPdfRef.current = true;
        currentPageRef.current = restoredPage;
        setPageNum(restoredPage);
        setLoading(false);
      } catch (err) {
        if (!active) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    })();

    return () => {
      active = false;
      pdfDocRef.current = null;
      renderQueueRef.current = null;
      void renderQueue.dispose();
      void session.dispose();
    };
  }, [url, loadAttempt]);

  const reportPosition = (page: number, mode: 'width' | 'manual', scale: number) => {
    if (!totalPages) return;
    const percent = totalPages === 1 ? 1 : (page - 1) / (totalPages - 1);
    onPositionRef.current?.({ version: 1, format: 'pdf', page,
      view: mode === 'width' ? { mode: 'width' } : { mode: 'manual', scale } }, percent);
  };

  // Queue ownership prevents overlapping writes and obsolete getPage results.
  useEffect(() => {
    const document = pdfDocRef.current;
    const canvas = canvasRef.current;
    const queue = renderQueueRef.current;
    if (loading || !document || !canvas || !queue || (fitWidth !== undefined && fitWidth <= 0)) return;
    void queue.request({
      document, canvas, page: pageNum, scale: manualScale, fitWidth,
      pixelRatio: window.devicePixelRatio || 1,
    }, {
      onStart: () => { setRendering(true); setRenderError(null); },
      onScale: (scale) => {
        setDisplayScale(scale);
        if (requestedZoomRef.current.mode === 'width') requestedZoomRef.current.scale = scale;
      },
      onError: (error) => setRenderError(error instanceof Error ? error.message : 'Failed to render this PDF page.'),
      onFinish: () => setRendering(false),
    });
  }, [pageNum, manualScale, fitWidth, loading, totalPages, renderAttempt]);

  useEffect(() => {
    currentPageRef.current = pageNum;
  }, [pageNum]);

  // Observe the scroll area's inner width, including scrollbar/padding changes.
  useEffect(() => {
    const area = canvasAreaRef.current;
    if (loading || !area) return;
    const measure = () => {
      const style = window.getComputedStyle(area);
      const width = area.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
      if (width > 0) setAvailableWidth(width);
    };
    measure();
    if (typeof ResizeObserver === 'undefined') {
      window.addEventListener('resize', measure);
      return () => window.removeEventListener('resize', measure);
    }
    const observer = new ResizeObserver(measure);
    observer.observe(area);
    return () => observer.disconnect();
  }, [loading, totalPages]);

  const adjustZoom = (delta: number) => {
    // Base repeated clicks on the latest requested zoom, not an older painting.
    const previous = requestedZoomRef.current.scale;
    const next = Math.min(Math.max(3, previous), Math.max(Math.min(0.4, previous), previous + delta));
    requestedZoomRef.current = { mode: 'manual', scale: next };
    reportPosition(currentPageRef.current, 'manual', next);
    setFitMode('manual');
    setManualScale(next);
    setDisplayScale(next);
  };

  const goToPage = (n: number) => {
    if (n < 1 || n > totalPages) return;
    currentPageRef.current = n;
    reportPosition(n, requestedZoomRef.current.mode, requestedZoomRef.current.scale);
    setPageNum(n);
  };

  const fitToWidth = () => { requestedZoomRef.current.mode = 'width'; reportPosition(currentPageRef.current, 'width', requestedZoomRef.current.scale); setFitMode('width'); };
  return { canvasRef, canvasAreaRef, pageNum, totalPages, displayScale, fitMode, fitToWidth, loading, error, rendering, renderError, setLoadAttempt, setRenderAttempt, adjustZoom, goToPage };
}

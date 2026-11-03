import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { parsePosition, fraction } from '@/domain/reading-position';
import type { ReaderPosition } from '@/domain/reading-position';
import { PdfSession } from '@/features/reader/pdf/pdf-session';
import { PdfRenderQueue } from '@/features/reader/pdf/pdf-render-queue';

interface PdfViewerProps {
  url: string;
  title: string;
  initialProgress?: number;
  initialPosition?: ReaderPosition | null;
  onPositionChange?: (position: Extract<ReaderPosition, { format: 'pdf' }>, percent: number) => void;
}

export function PdfViewer({ url, title, initialProgress = 0, initialPosition, onPositionChange }: PdfViewerProps) {
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

  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-amber-600 animate-spin" />
          <p className="text-sm text-stone-500">Loading PDF...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)] px-4">
        <div className="text-center max-w-md">
          <p role="alert" className="text-red-600 text-sm font-medium mb-2">Failed to load PDF</p>
          <p className="text-stone-500 text-xs">{error}</p>
          <button
            onClick={() => setLoadAttempt((attempt) => attempt + 1)}
            className="block mx-auto mt-4 px-4 py-2 rounded-lg bg-amber-600 text-white text-sm hover:bg-amber-500"
          >
            Retry loading PDF
          </button>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-sm font-medium text-white bg-amber-600 hover:bg-amber-500 rounded-lg transition-all"
          >
            Open in new tab
          </a>
        </div>
      </div>
    );
  }

  return (
    <div
      className="flex flex-col h-[calc(100vh-7rem)]"
      role="region"
      aria-busy={rendering}
      aria-label={`${title} PDF reader`}
    >
      {/* PDF controls bar */}
      <div className="flex flex-wrap items-center justify-center gap-3 py-2 bg-white border-b border-stone-200 flex-shrink-0">
        <button
          onClick={() => goToPage(pageNum - 1)}
          aria-label="Previous PDF page"
          disabled={pageNum <= 1}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-stone-600 font-medium min-w-[80px] text-center">
          {pageNum} / {totalPages}
        </span>
        <button
          onClick={() => goToPage(pageNum + 1)}
          aria-label="Next PDF page"
          disabled={pageNum >= totalPages}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-stone-200 mx-1" />
        <button
          onClick={() => adjustZoom(-0.2)}
          aria-label="Zoom out"
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-stone-400 min-w-[40px] text-center">{Math.round(displayScale * 100)}%</span>
        <button
          onClick={() => adjustZoom(0.2)}
          aria-label="Zoom in"
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
        <button
          onClick={() => { requestedZoomRef.current.mode = 'width'; reportPosition(currentPageRef.current, 'width', requestedZoomRef.current.scale); setFitMode('width'); }}
          aria-pressed={fitMode === 'width'}
          className="px-2 py-1 rounded text-xs text-stone-700 hover:bg-stone-100 aria-pressed:bg-stone-200"
        >
          Fit width
        </button>
      </div>

      {renderError && (
        <div role="alert" className="bg-red-50 border-b border-red-200 p-3 text-sm text-red-800 text-center">
          <p>Could not render this PDF page: {renderError}</p>
          <button
            onClick={() => setRenderAttempt((attempt) => attempt + 1)}
            className="mt-2 rounded-lg bg-red-700 px-3 py-1.5 text-white hover:bg-red-600"
          >
            Retry rendering page
          </button>
        </div>
      )}
      <div className="h-5 flex-shrink-0">
        {rendering && <p role="status" className="text-center text-xs text-stone-500">Rendering page…</p>}
      </div>

      {/* PDF canvas area */}
      <div ref={canvasAreaRef} className="flex-1 overflow-auto bg-stone-100 p-4" style={{ scrollbarGutter: 'stable' }}>
        <canvas ref={canvasRef} className="block mx-auto shadow-lg rounded" />
      </div>
    </div>
  );
}

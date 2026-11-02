import { useState, useRef, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import type { PDFDocumentProxy } from 'pdfjs-dist';
import { PdfSession } from '@/features/reader/pdf/pdf-session';
import { PdfRenderQueue } from '@/features/reader/pdf/pdf-render-queue';

interface PdfViewerProps {
  url: string;
  title: string;
  initialProgress?: number;
  onProgress?: (percent: number) => void;
}

export function PdfViewer({ url, title, initialProgress = 0, onProgress }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<PDFDocumentProxy | null>(null);
  const renderQueueRef = useRef<PdfRenderQueue | null>(null);
  const onProgressRef = useRef(onProgress);
  const initialProgressRef = useRef(initialProgress);
  const currentPageRef = useRef(1);
  const hasLoadedPdfRef = useRef(false);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  useEffect(() => {
    onProgressRef.current = onProgress;
  }, [onProgress]);

  // Load PDF document
  useEffect(() => {
    let active = true;
    const session = new PdfSession((error) => console.error('PDF cleanup failed:', error));
    const renderQueue = new PdfRenderQueue();
    renderQueueRef.current = renderQueue;

    (async () => {
      setLoading(true);
      setError(null);
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
        const boundedProgress = Math.min(1, Math.max(0, initialProgressRef.current));
        const restoredPage = hasLoadedPdfRef.current
          ? boundedCurrentPage
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
  }, [url]);

  useEffect(() => {
    if (totalPages === 0) return;
    const percent = totalPages === 1 ? 1 : (pageNum - 1) / (totalPages - 1);
    onProgressRef.current?.(percent);
  }, [pageNum, totalPages]);

  // Queue ownership prevents overlapping writes and obsolete getPage results.
  useEffect(() => {
    const document = pdfDocRef.current;
    const canvas = canvasRef.current;
    const queue = renderQueueRef.current;
    if (loading || !document || !canvas || !queue) return;
    void queue.request({
      document, canvas, page: pageNum, scale,
      pixelRatio: window.devicePixelRatio || 1,
    }, {
      onStart: () => setRendering(true),
      onError: (error) => console.error('PDF page rendering failed:', error),
      onFinish: () => setRendering(false),
    });
  }, [pageNum, scale, loading, totalPages]);

  useEffect(() => {
    currentPageRef.current = pageNum;
  }, [pageNum]);

  // Fit scale to container width on initial load
  useEffect(() => {
    if (!loading && containerRef.current && totalPages > 0) {
      const containerWidth = containerRef.current.clientWidth - 32;
      if (containerWidth > 0 && containerWidth < 800) {
        setScale(Math.max(0.5, containerWidth / 612));
      }
    }
  }, [loading, totalPages]);

  const goToPage = (n: number) => {
    if (n < 1 || n > totalPages || rendering) return;
    currentPageRef.current = n;
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
          <p className="text-red-600 text-sm font-medium mb-2">Failed to load PDF</p>
          <p className="text-stone-500 text-xs">{error}</p>
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
      ref={containerRef}
      role="region"
      aria-label={`${title} PDF reader`}
    >
      {/* PDF controls bar */}
      <div className="flex items-center justify-center gap-4 py-2 bg-white border-b border-stone-200 flex-shrink-0">
        <button
          onClick={() => goToPage(pageNum - 1)}
          disabled={pageNum <= 1 || rendering}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <span className="text-sm text-stone-600 font-medium min-w-[80px] text-center">
          {pageNum} / {totalPages}
        </span>
        <button
          onClick={() => goToPage(pageNum + 1)}
          disabled={pageNum >= totalPages || rendering}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-stone-200 mx-1" />
        <button
          onClick={() => setScale((s) => Math.max(0.4, s - 0.2))}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomOut className="w-4 h-4" />
        </button>
        <span className="text-xs text-stone-400 min-w-[40px] text-center">{Math.round(scale * 100)}%</span>
        <button
          onClick={() => setScale((s) => Math.min(3, s + 0.2))}
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
        </button>
      </div>

      {/* PDF canvas area */}
      <div className="flex-1 overflow-auto bg-stone-100 flex justify-center p-4">
        <canvas ref={canvasRef} className="shadow-lg rounded" />
      </div>
    </div>
  );
}

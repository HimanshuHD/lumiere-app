import { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';

interface PdfViewerProps {
  url: string;
  title: string;
}

export function PdfViewer({ url, title }: PdfViewerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pdfDocRef = useRef<any>(null);
  const [pageNum, setPageNum] = useState(1);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [rendering, setRendering] = useState(false);

  // Load PDF document
  useEffect(() => {
    let cancelled = false;

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

        const loadingTask = pdfjsLib.getDocument(url);
        const pdf = await loadingTask.promise;
        if (cancelled) return;
        pdfDocRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPageNum(1);
        setLoading(false);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : 'Failed to load PDF');
        setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
      if (pdfDocRef.current) {
        pdfDocRef.current.destroy();
        pdfDocRef.current = null;
      }
    };
  }, [url]);

  // Render current page
  const renderPage = useCallback(async (num: number, currentScale: number) => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    setRendering(true);
    try {
      const page = await pdfDocRef.current.getPage(num);
      const viewport = page.getViewport({ scale: currentScale });
      const canvas = canvasRef.current;
      const context = canvas.getContext('2d');
      if (!context) return;

      const outputScale = window.devicePixelRatio || 1;
      canvas.width = Math.floor(viewport.width * outputScale);
      canvas.height = Math.floor(viewport.height * outputScale);
      canvas.style.width = `${Math.floor(viewport.width)}px`;
      canvas.style.height = `${Math.floor(viewport.height)}px`;

      const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;
      await page.render({ canvasContext: context, viewport, transform }).promise;
    } catch {
      // page render can fail during teardown — ignore
    } finally {
      setRendering(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && totalPages > 0) {
      renderPage(pageNum, scale);
    }
  }, [pageNum, scale, loading, totalPages, renderPage]);

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
    <div className="flex flex-col h-[calc(100vh-7rem)]" ref={containerRef}>
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

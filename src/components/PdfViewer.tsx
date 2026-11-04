import { ChevronLeft, ChevronRight, Loader2, ZoomIn, ZoomOut } from 'lucide-react';
import { usePdfController, type PdfViewerProps } from '@/features/reader/pdf';

export function PdfViewer(props: PdfViewerProps) {
  const { url, title } = props;
  const { canvasRef, canvasAreaRef, pageNum, totalPages, displayScale, fitMode, fitToWidth, loading, error, rendering, renderError, setLoadAttempt, setRenderAttempt, adjustZoom, goToPage } = usePdfController(props);
  if (loading) {
    return (
      <div className="flex items-center justify-center h-[calc(100vh-7rem)]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 aria-hidden="true" className="w-8 h-8 text-amber-600 animate-spin" />
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
          <ChevronLeft aria-hidden="true" className="w-4 h-4" />
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
          <ChevronRight aria-hidden="true" className="w-4 h-4" />
        </button>
        <div className="w-px h-5 bg-stone-200 mx-1" />
        <button
          onClick={() => adjustZoom(-0.2)}
          aria-label="Zoom out"
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomOut aria-hidden="true" className="w-4 h-4" />
        </button>
        <span className="text-xs text-stone-400 min-w-[40px] text-center">{Math.round(displayScale * 100)}%</span>
        <button
          onClick={() => adjustZoom(0.2)}
          aria-label="Zoom in"
          className="p-1.5 rounded-lg text-stone-600 hover:bg-stone-100 transition-colors"
        >
          <ZoomIn aria-hidden="true" className="w-4 h-4" />
        </button>
        <button
          onClick={fitToWidth}
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

import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';
import { fitPdfPageWidth } from './pdf-fit.ts';
import type { PageLayers } from './pdf-page-layers.ts';

export interface PdfRenderRequest {
  document: PDFDocumentProxy;
  page: number;
  scale: number;
  fitWidth?: number;
  canvas: HTMLCanvasElement;
  pixelRatio: number;
  layers?: PageLayers;
}
export interface PdfRenderCallbacks {
  onStart(): void;
  onScale?(scale: number): void;
  onError(error: unknown): void;
  onFinish(): void;
}

/** Latest request wins, but a canvas is never reused before cancellation settles. */
export class PdfRenderQueue {
  private generation = 0;
  private disposed = false;
  private task: RenderTask | null = null;
  private layers?: PageLayers;
  private tail: Promise<void> = Promise.resolve();

  request(request: PdfRenderRequest, callbacks: PdfRenderCallbacks): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const generation = ++this.generation;
    this.task?.cancel();
    this.layers?.cancel();
    this.layers = request.layers;
    this.layers?.cancel();
    const isCurrent = () => !this.disposed && generation === this.generation;
    this.tail = this.tail.catch(() => undefined).then(async () => {
      if (!isCurrent()) return;
      callbacks.onStart();
      try {
        const page = await request.document.getPage(request.page);
        if (!isCurrent()) return;
        const scale = request.fitWidth === undefined ? request.scale
          : fitPdfPageWidth(request.fitWidth, page.getViewport({ scale: 1 }).width);
        const viewport = page.getViewport({ scale });
        callbacks.onScale?.(scale);
        const canvas = request.canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('A canvas drawing context is unavailable.');
        const ratio = request.pixelRatio;
        canvas.width = Math.max(1, Math.floor(viewport.width * ratio));
        canvas.height = Math.max(1, Math.floor(viewport.height * ratio));
        canvas.style.width = `${viewport.width}px`;
        canvas.style.height = `${viewport.height}px`;
        const task = page.render({
          canvasContext: context, viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        this.task = task;
        await task.promise;
        if (isCurrent()) await request.layers?.render(page, viewport, isCurrent);
      } catch (error) {
        // Our cancellations invalidate the request first. A current failure is real.
        if (isCurrent()) callbacks.onError(error);
      } finally {
        this.task = null;
        if (isCurrent()) callbacks.onFinish();
      }
    });
    return this.tail;
  }

  dispose(): Promise<void> {
    this.disposed = true;
    this.generation += 1;
    this.task?.cancel();
    this.layers?.cancel();
    return this.tail.catch(() => undefined);
  }
}

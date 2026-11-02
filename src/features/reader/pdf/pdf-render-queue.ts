import type { PDFDocumentProxy, RenderTask } from 'pdfjs-dist';

export interface PdfRenderRequest {
  document: PDFDocumentProxy;
  page: number;
  scale: number;
  canvas: HTMLCanvasElement;
  pixelRatio: number;
}
export interface PdfRenderCallbacks {
  onStart(): void;
  onError(error: unknown): void;
  onFinish(): void;
}

/** Latest request wins, but a canvas is never reused before cancellation settles. */
export class PdfRenderQueue {
  private generation = 0;
  private disposed = false;
  private task: RenderTask | null = null;
  private tail: Promise<void> = Promise.resolve();

  request(request: PdfRenderRequest, callbacks: PdfRenderCallbacks): Promise<void> {
    if (this.disposed) return Promise.resolve();
    const generation = ++this.generation;
    this.task?.cancel();
    const isCurrent = () => !this.disposed && generation === this.generation;
    this.tail = this.tail.catch(() => undefined).then(async () => {
      if (!isCurrent()) return;
      callbacks.onStart();
      try {
        const page = await request.document.getPage(request.page);
        if (!isCurrent()) return;
        const viewport = page.getViewport({ scale: request.scale });
        const canvas = request.canvas;
        const context = canvas.getContext('2d');
        if (!context) throw new Error('A canvas drawing context is unavailable.');
        const ratio = request.pixelRatio;
        canvas.width = Math.floor(viewport.width * ratio);
        canvas.height = Math.floor(viewport.height * ratio);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;
        const task = page.render({
          canvasContext: context, viewport,
          transform: ratio !== 1 ? [ratio, 0, 0, ratio, 0, 0] : undefined,
        });
        this.task = task;
        await task.promise;
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
    return this.tail.catch(() => undefined);
  }
}

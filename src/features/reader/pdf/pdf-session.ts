import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';

/** Owns a PDF.js loading task, which also owns the loaded document/worker. */
export class PdfSession {
  private generation = 0;
  private disposed = false;
  private task: PDFDocumentLoadingTask | null = null;
  private destructions = new WeakMap<PDFDocumentLoadingTask, Promise<void>>();

  private readonly onCleanupError: (error: unknown) => void;

  constructor(onCleanupError: (error: unknown) => void = console.error) {
    this.onCleanupError = onCleanupError;
  }

  private destroy(task: PDFDocumentLoadingTask): Promise<void> {
    const existing = this.destructions.get(task);
    if (existing) return existing;
    const destruction = Promise.resolve().then(() => task.destroy()).catch(this.onCleanupError);
    this.destructions.set(task, destruction);
    return destruction;
  }

  async load(createTask: () => PDFDocumentLoadingTask): Promise<PDFDocumentProxy | null> {
    if (this.disposed) return null;
    const generation = ++this.generation;
    const previous = this.task;
    this.task = null;
    if (previous) await this.destroy(previous);
    if (this.disposed || generation !== this.generation) return null;

    const task = createTask();
    this.task = task;
    try {
      const document = await task.promise;
      if (this.disposed || generation !== this.generation) {
        await this.destroy(task);
        return null;
      }
      return document;
    } catch (error) {
      if (this.disposed || generation !== this.generation) return null;
      this.task = null;
      await this.destroy(task);
      if (this.disposed || generation !== this.generation) return null;
      throw error;
    }
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    this.generation += 1;
    const task = this.task;
    this.task = null;
    if (task) await this.destroy(task);
  }
}

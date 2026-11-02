import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PDFDocumentProxy, PDFPageProxy, RenderTask } from 'pdfjs-dist';
import { PdfRenderQueue } from '../src/features/reader/pdf/pdf-render-queue.ts';

function deferred<T>() {
  let resolve!: (value: T) => void; let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
function harness() {
  const renders: Array<{ result: ReturnType<typeof deferred<void>>; cancelled: boolean; scale: number }> = [];
  const errors: unknown[] = []; let finished = 0;
  const page = {
    getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
    render: ({ viewport }: { viewport: { width: number } }) => {
      const render = { result: deferred<void>(), cancelled: false, scale: viewport.width / 600 };
      renders.push(render);
      return { promise: render.result.promise, cancel() { render.cancelled = true; } } as RenderTask;
    },
  } as unknown as PDFPageProxy;
  const document = { getPage: async () => page } as unknown as PDFDocumentProxy;
  const canvas = { style: {}, getContext: () => ({}) } as unknown as HTMLCanvasElement;
  const callbacks = { onStart() {}, onError(error: unknown) { errors.push(error); }, onFinish() { finished += 1; } };
  const request = { document, canvas, page: 1, scale: 1, pixelRatio: 2 };
  return { renders, errors, callbacks, request, page, get finished() { return finished; } };
}
it('waits for cancelled painting to settle and skips intermediate zoom requests', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const first = queue.request(h.request, h.callbacks); await flush();
  const middle = queue.request({ ...h.request, scale: 1.5 }, h.callbacks);
  const last = queue.request({ ...h.request, scale: 2 }, h.callbacks);
  await flush(); assert.equal(h.renders.length, 1); assert.equal(h.renders[0].cancelled, true);
  h.renders[0].result.reject(new Error('Expected cancellation')); await flush();
  assert.equal(h.renders.length, 2); assert.equal(h.renders[1].scale, 2);
  h.renders[1].result.resolve(); await Promise.all([first, middle, last]);
  assert.equal(h.finished, 1); assert.deepEqual(h.errors, []);
  assert.equal(h.request.canvas.width, 2400);
});
it('a stale getPage cannot paint a canvas or report completion', async () => {
  const h = harness(); const queue = new PdfRenderQueue(); const pending = deferred<PDFPageProxy>();
  const slow = { getPage: () => pending.promise } as unknown as PDFDocumentProxy;
  const old = queue.request({ ...h.request, document: slow }, h.callbacks); await flush();
  const next = queue.request({ ...h.request, page: 2 }, h.callbacks);
  pending.resolve(h.page); await flush();
  assert.equal(h.renders.length, 1); h.renders[0].result.resolve();
  await Promise.all([old, next]); assert.equal(h.finished, 1);
});
it('disposal cancels active rendering and suppresses its callbacks', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const render = queue.request(h.request, h.callbacks); await flush();
  const disposed = queue.dispose(); assert.equal(h.renders[0].cancelled, true);
  h.renders[0].result.reject(new Error('cancelled')); await Promise.all([render, disposed]);
  assert.equal(h.finished, 0); assert.deepEqual(h.errors, []);
  await queue.request(h.request, h.callbacks); assert.equal(h.renders.length, 1);
});
it('reports genuine render failure and can retry the same page without reloading the PDF', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const failed = queue.request(h.request, h.callbacks); await flush();
  h.renders[0].result.reject(new Error('Page painting failed')); await failed;
  assert.equal((h.errors[0] as Error).message, 'Page painting failed');
  assert.equal(h.finished, 1);
  const retried = queue.request(h.request, h.callbacks); await flush();
  h.renders[1].result.resolve(); await retried;
  assert.equal(h.finished, 2); assert.equal(h.errors.length, 1);
});
it('reports a current page lookup error rather than hiding it as cancellation', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const document = { getPage: async () => { throw new Error('Page unavailable'); } } as unknown as PDFDocumentProxy;
  await queue.request({ ...h.request, document }, h.callbacks);
  assert.equal((h.errors[0] as Error).message, 'Page unavailable'); assert.equal(h.finished, 1);
});
it('reports a missing canvas context as a retryable current failure', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const canvas = { getContext: () => null } as unknown as HTMLCanvasElement;
  await queue.request({ ...h.request, canvas }, h.callbacks);
  assert.match((h.errors[0] as Error).message, /drawing context/);
});
it('automatic fit uses page dimensions and keeps CSS size independent of pixel ratio', async () => {
  const h = harness(); const queue = new PdfRenderQueue(); const scales: number[] = [];
  const render = queue.request({ ...h.request, fitWidth: 300 }, { ...h.callbacks, onScale: (s) => scales.push(s) });
  await flush(); assert.equal(h.renders[0].scale, 0.5);
  assert.equal(h.request.canvas.style.width, '300px');
  assert.equal(h.request.canvas.width, 600);
  h.renders[0].result.resolve(); await render; assert.deepEqual(scales, [0.5]);
});
it('manual zoom uses the selected scale rather than an automatic fit', async () => {
  const h = harness(); const queue = new PdfRenderQueue();
  const render = queue.request({ ...h.request, scale: 2 }, h.callbacks);
  await flush(); assert.equal(h.request.canvas.style.width, '1200px');
  h.renders[0].result.resolve(); await render;
});

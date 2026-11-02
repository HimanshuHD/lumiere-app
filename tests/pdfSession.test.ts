import assert from 'node:assert/strict';
import { it } from 'node:test';
import type { PDFDocumentLoadingTask, PDFDocumentProxy } from 'pdfjs-dist';
import { PdfSession } from '../src/features/reader/pdf/pdf-session.ts';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function task() {
  const result = deferred<PDFDocumentProxy>();
  let destructions = 0;
  return { result, get destructions() { return destructions; },
    value: { promise: result.promise, async destroy() { destructions += 1; } } as PDFDocumentLoadingTask };
}

it('destroys a pending load and ignores a document arriving after disposal', async () => {
  const pending = task();
  const session = new PdfSession();
  const loaded = session.load(() => pending.value);
  await session.dispose();
  pending.result.resolve({ numPages: 3 } as PDFDocumentProxy);
  assert.equal(await loaded, null);
  await session.dispose();
  assert.equal(pending.destructions, 1);
});
it('a superseded load cannot replace the new document', async () => {
  const old = task(); const next = task(); const session = new PdfSession();
  const oldLoad = session.load(() => old.value);
  const newLoad = session.load(() => next.value);
  await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
  const document = { numPages: 7 } as PDFDocumentProxy;
  next.result.resolve(document); old.result.resolve({ numPages: 2 } as PDFDocumentProxy);
  assert.equal(await oldLoad, null);
  assert.equal(await newLoad, document);
  assert.equal(old.destructions, 1);
  await session.dispose(); assert.equal(next.destructions, 1);
});
it('disposal before a lazy PDF.js import finishes never starts a loading task', async () => {
  const session = new PdfSession(); await session.dispose();
  assert.equal(await session.load(() => { throw new Error('must not start'); }), null);
});
it('current load failures remain visible to the caller and can be disposed', async () => {
  const pending = task(); const session = new PdfSession();
  const loaded = session.load(() => pending.value); pending.result.reject(new Error('Corrupt PDF'));
  await assert.rejects(loaded, /Corrupt PDF/);
  assert.equal(pending.destructions, 1, 'failure releases its worker before the user retries');
  await session.dispose(); assert.equal(pending.destructions, 1);
});
it('cleanup errors are handled without an unhandled rejection', async () => {
  const errors: unknown[] = [];const session = new PdfSession((e) => { errors.push(e); });
  const document = {} as PDFDocumentProxy;
  await session.load(() => ({ promise: Promise.resolve(document), destroy: async () => { throw new Error('cleanup'); } }) as PDFDocumentLoadingTask);
  await session.dispose(); assert.equal(errors.length, 1);
});
it('a new load after failure disposes the failed task before succeeding', async () => {
  const failed = task(); const next = task(); const session = new PdfSession();
  const attempt = session.load(() => failed.value); failed.result.reject(new Error('Network error'));
  await assert.rejects(attempt, /Network error/);
  const retried = session.load(() => next.value);
  const document = { numPages: 10 } as PDFDocumentProxy; next.result.resolve(document);
  assert.equal(await retried, document); assert.equal(failed.destructions, 1);
  await session.dispose();
});

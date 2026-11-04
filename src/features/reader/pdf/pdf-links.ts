import type { PDFDocumentProxy } from 'pdfjs-dist';

/** PDF link payloads are untrusted even after the PDF parser accepts the file. */
export function safePdfUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:', 'mailto:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; }
  catch { return null; }
}
export async function destinationPage(document: Pick<PDFDocumentProxy, 'getDestination' | 'getPageIndex' | 'numPages'>, destination: unknown): Promise<number | null> {
  const value = typeof destination === 'string' ? await document.getDestination(destination) : destination;
  if (!Array.isArray(value) || !value.length) return null;
  const ref = value[0];
  const index = typeof ref === 'number' ? ref : ref && typeof ref === 'object' && Number.isInteger(ref.num) && Number.isInteger(ref.gen) ? await document.getPageIndex(ref) : NaN;
  return Number.isInteger(index) && index >= 0 && index < document.numPages ? index + 1 : null;
}

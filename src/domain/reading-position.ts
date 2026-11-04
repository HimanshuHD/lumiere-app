export type ReaderPosition =
  | { version: 1; format: 'txt'; chapterIndex: number; chapterProgress: number }
  | { version: 1; format: 'pdf'; page: number; view: { mode: 'width' } | { mode: 'manual'; scale: number } }
  | { version: 1; format: 'epub'; cfi: string; approximateProgress: number };

export const fraction = (value: unknown): number =>
  typeof value === 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
const integer = (value: unknown, fallback: number) =>
  typeof value === 'number' && Number.isFinite(value) ? Math.max(fallback, Math.floor(value)) : fallback;

export function parsePosition(value: unknown): ReaderPosition | null {
  if (!value || typeof value !== 'object') return null;
  const p = value as Record<string, unknown>;
  if (p.version !== 1) return null;
  if (p.format === 'txt') return { version: 1, format: 'txt', chapterIndex: integer(p.chapterIndex, 0), chapterProgress: fraction(p.chapterProgress) };
  if (p.format === 'epub' && typeof p.cfi === 'string' && p.cfi.startsWith('epubcfi(') && p.cfi.endsWith(')') && p.cfi.length <= 8192) {
    return { version: 1, format: 'epub', cfi: p.cfi, approximateProgress: fraction(p.approximateProgress) };
  }
  if (p.format === 'pdf') {
    const view = p.view as Record<string, unknown> | undefined;
    return { version: 1, format: 'pdf', page: integer(p.page, 1), view: view?.mode === 'manual' && typeof view.scale === 'number' && Number.isFinite(view.scale) && view.scale > 0
      ? { mode: 'manual', scale: Math.min(10, Math.max(0.01, view.scale)) } : { mode: 'width' } };
  }
  return null;
}

export function textPosition(value: unknown, chapterCount: number): Extract<ReaderPosition, { format: 'txt' }> {
  const p = parsePosition(value);
  return { version: 1, format: 'txt', chapterIndex: Math.min(Math.max(0, chapterCount - 1), p?.format === 'txt' ? p.chapterIndex : 0), chapterProgress: p?.format === 'txt' ? p.chapterProgress : 0 };
}

export function legacyPosition(format: string | null | undefined, row?: { chapter_index: number; scroll_percent: number; epub_cfi?: string | null; position?: unknown }): ReaderPosition | null {
  const parsed = parsePosition(row?.position);
  if (parsed && parsed.format === (format || 'txt')) return parsed;
  if (format === 'pdf') return null; // Convert legacy percentage after the page count is available.
  if (format === 'epub') return parsePosition({ version: 1, format, cfi: row?.epub_cfi, approximateProgress: fraction(Number(row?.scroll_percent)) });
  return { version: 1, format: 'txt', chapterIndex: integer(row?.chapter_index, 0), chapterProgress: fraction(Number(row?.scroll_percent)) };
}

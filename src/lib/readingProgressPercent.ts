import type { ReadingProgress } from '../domain/documents.ts';
import type {  DocumentSummary  } from '../domain/document-summary.ts';
import { fraction, parsePosition } from '../domain/reading-position.ts';
export function readingProgressPercent(document: DocumentSummary, progress?: ReadingProgress): number {
  if (!progress) return 0;
  const position = parsePosition(progress.position);
  const ratio = position?.format === 'txt'
    ? (position.chapterIndex + position.chapterProgress) / Math.max(1, document.chapter_count)
    : position?.format === 'epub' ? position.approximateProgress
    : position?.format === 'pdf' || document.file_format === 'pdf' || document.file_format === 'epub'
      ? Number(progress.scroll_percent)
      : (progress.chapter_index + Number(progress.scroll_percent)) / Math.max(1, document.chapter_count);
  return Math.round(fraction(ratio) * 100);
}

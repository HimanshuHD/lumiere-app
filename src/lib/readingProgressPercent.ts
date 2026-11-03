import type { ReadingProgress } from './supabase';
import type { DocumentSummary } from '../features/data/document-summary';
import { fraction, parsePosition } from '../features/reader/progress/position.ts';
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

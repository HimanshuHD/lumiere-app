import type { Document } from './documents.ts';
export type DocumentSummary = Omit<Document, 'chapters'> & { chapter_count: number };
export type BookmarkSummary = { id: string; user_id: string; document_id: string; created_at: string; document?: DocumentSummary | null };
export type ReadingListSummary = BookmarkSummary;
export function summarizeDocument(document: Document): DocumentSummary {
  const { chapters, ...metadata } = document;
  return { ...metadata, chapter_count: document.chapter_count ?? chapters.length };
}

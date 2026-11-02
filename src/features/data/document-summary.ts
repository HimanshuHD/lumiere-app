import type { Document } from '../../lib/supabase';
export type DocumentSummary = Omit<Document, 'chapters'> & { chapter_count: number };
export type BookmarkSummary = { id: string; user_id: string; document_id: string; created_at: string; document?: DocumentSummary | null };
export type ReadingListSummary = BookmarkSummary;
export const DOCUMENT_SUMMARY_FIELDS = 'id,title,author,category,cover_url,reading_time,summary,is_featured,created_at,origin,visibility,uploaded_by,page_count,file_url,file_storage_path,cover_storage_path,file_format,file_name,source_url,source_identity,chapter_count';
export function summarizeDocument(document: Document): DocumentSummary {
  const { chapters, ...metadata } = document;
  return { ...metadata, chapter_count: document.chapter_count ?? chapters.length };
}

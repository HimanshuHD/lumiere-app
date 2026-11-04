export type DocumentOrigin = 'user_upload' | 'catalog_import' | 'legacy_unowned' | 'demo';
export type DocumentVisibility = 'private' | 'shared';
export const DOCUMENT_FORMATS = ['txt', 'pdf', 'epub'] as const;
export type DocumentFormat = typeof DOCUMENT_FORMATS[number];
export const DOCUMENT_CATEGORIES = ['Fiction', 'Non-Fiction', 'Science', 'History', 'Technology', 'Philosophy', 'Adventure'] as const;

export interface Chapter {
  title: string;
  content: string;
}

export interface Document {
  id: string;
  title: string;
  author: string;
  category: string;
  cover_url: string | null;
  reading_time: number;
  summary: string;
  chapters: Chapter[];
  chapter_count?: number;
  is_featured: boolean;
  created_at: string;
  origin: DocumentOrigin;
  visibility: DocumentVisibility;
  uploaded_by?: string | null;
  page_count?: number | null;
  file_url?: string | null;
  file_storage_path?: string | null;
  cover_storage_path?: string | null;
  file_format?: string | null;
  file_name?: string | null;
  source_url?: string | null;
  source_identity?: string | null;
}

export interface UploadResult {
  document: Document;
}

export interface Bookmark {
  id: string;
  user_id: string;
  document_id: string;
  created_at: string;
  document?: Document;
}

export interface ReadingProgress {
  id: string;
  user_id: string;
  document_id: string;
  chapter_index: number;
  scroll_percent: number;
  epub_cfi?: string | null;
  position?: unknown;
  revision?: number;
  mutation_id?: string | null;
  updated_at: string;
}

export interface ReadingListItem {
  id: string;
  user_id: string;
  document_id: string;
  created_at: string;
  document?: Document;
}

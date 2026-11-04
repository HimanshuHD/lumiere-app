import type { ReaderPosition } from './reading-position.ts';
export interface ProgressRow {
  id: string; user_id: string; document_id: string; chapter_index: number;
  scroll_percent: number; epub_cfi?: string | null; position?: unknown;
  revision?: number; mutation_id?: string | null; updated_at: string;
}
export interface PendingSave {
  position: ReaderPosition; chapterIndex: number; progress: number;
  expectedRevision: number; mutationId: string;
}
export type SaveStatus = 'saved' | 'pending' | 'saving' | 'error' | 'conflict';
export interface PendingStorage {
  read(documentId: string): unknown;
  write(documentId: string, pending: PendingSave): void;
  remove(documentId: string, mutationId: string): void;
  documentIds(): string[];
}
export interface SaveResult { accepted: boolean; row: ProgressRow | null }


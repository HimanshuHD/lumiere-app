import type { Document } from './documents.ts';
import type { BookmarkSummary, DocumentSummary } from './document-summary.ts';
export type CollectionName = 'bookmarks' | 'reading_list';
export type CollectionReference = Omit<BookmarkSummary, 'document'>;
/** Account-bound persistence port. It does not own caches, navigation, or UI messages. */
export interface UserDataRepository {
  listDocuments(signal: AbortSignal): Promise<DocumentSummary[]>;
  listCatalog(signal: AbortSignal): Promise<DocumentSummary[]>;
  listLocked(signal: AbortSignal): Promise<DocumentSummary[]>;
  listMembershipIds(signal: AbortSignal): Promise<string[]>;
  listReferences(collection: CollectionName, signal: AbortSignal): Promise<BookmarkSummary[]>;
  getDocument(id: string, signal: AbortSignal): Promise<Document | null>;
  getSummary(id: string): Promise<DocumentSummary>;
  saveReference(collection: CollectionName, id: string): Promise<CollectionReference>;
  deleteReferences(collection: CollectionName, id: string): Promise<number>;
}

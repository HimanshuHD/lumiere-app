import type { Document } from '@/lib/supabase';
import type { DocumentSummary } from '@/features/data/document-summary';

export type UserDocumentUpdate = Pick<Document, 'title' | 'author' | 'category' | 'summary' | 'visibility'>;

export interface UserDocumentVisibilityStore {
  updateOwnedDocument(userId: string, documentId: string, updates: UserDocumentUpdate): Promise<DocumentSummary>;
}

export async function updateUserDocument(
  store: UserDocumentVisibilityStore,
  userId: string,
  document: Pick<Document, 'id' | 'origin' | 'uploaded_by'>,
  updates: UserDocumentUpdate,
): Promise<DocumentSummary> {
  if (document.origin !== 'user_upload' || document.uploaded_by !== userId) {
    throw new Error('Only the owner can edit this uploaded document.');
  }
  return store.updateOwnedDocument(userId, document.id, updates);
}

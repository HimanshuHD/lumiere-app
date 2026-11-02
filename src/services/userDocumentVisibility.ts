import type { Document } from '@/lib/supabase';

export type UserDocumentUpdate = Pick<Document, 'title' | 'author' | 'category' | 'summary' | 'visibility'>;

export interface UserDocumentVisibilityStore {
  updateOwnedDocument(userId: string, documentId: string, updates: UserDocumentUpdate): Promise<Document>;
}

export async function updateUserDocument(
  store: UserDocumentVisibilityStore,
  userId: string,
  document: Document,
  updates: UserDocumentUpdate,
): Promise<Document> {
  if (document.origin !== 'user_upload' || document.uploaded_by !== userId) {
    throw new Error('Only the owner can edit this uploaded document.');
  }
  return store.updateOwnedDocument(userId, document.id, updates);
}

import type { Document } from '@/lib/supabase';

export interface CatalogCollectionStore {
  addMembership(userId: string, documentId: string): Promise<void>;
}

export async function addCatalogDocumentToCollection(
  store: CatalogCollectionStore,
  userId: string,
  document: Document,
): Promise<Document> {
  if (document.origin !== 'catalog_import' || document.visibility !== 'shared') {
    throw new Error('Only shared catalog documents can be added to your collection.');
  }
  await store.addMembership(userId, document.id);
  return document;
}


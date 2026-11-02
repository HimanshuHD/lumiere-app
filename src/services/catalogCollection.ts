import type { Document } from '@/lib/supabase';

export interface CatalogCollectionStore {
  addMembership(userId: string, documentId: string): Promise<void>;
  removeMembership(userId: string, documentId: string): Promise<void>;
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

export async function removeCatalogDocumentFromCollection(
  store: CatalogCollectionStore,
  userId: string,
  document: Document,
): Promise<void> {
  if (document.origin !== 'catalog_import' || document.visibility !== 'shared') {
    throw new Error('Only shared catalog documents can be removed from your collection.');
  }
  await store.removeMembership(userId, document.id);
}

import type { Document } from '@/lib/supabase';
import { addCatalogDocumentToCollection, type CatalogCollectionStore } from './catalogCollection.ts';

export interface CatalogImportRequest {
  catalogUrl: string;
  bookId: string;
  downloadUrl: string;
  format: 'epub' | 'pdf';
}

export interface CatalogImportStore {
  importOrReuseDocument(request: CatalogImportRequest): Promise<unknown>;
}

function isSharedCatalogDocument(value: unknown): value is Document {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return typeof record.id === 'string' &&
    typeof record.title === 'string' &&
    typeof record.author === 'string' &&
    typeof record.category === 'string' &&
    (typeof record.cover_url === 'string' || record.cover_url === null) &&
    typeof record.reading_time === 'number' &&
    typeof record.summary === 'string' &&
    Array.isArray(record.chapters) &&
    typeof record.is_featured === 'boolean' &&
    typeof record.created_at === 'string' &&
    record.origin === 'catalog_import' &&
    record.visibility === 'shared';
}

export async function importCatalogDocumentToCollection(
  importStore: CatalogImportStore,
  collectionStore: CatalogCollectionStore,
  userId: string,
  request: CatalogImportRequest,
): Promise<Document> {
  const importedDocument = await importStore.importOrReuseDocument(request);
  if (!isSharedCatalogDocument(importedDocument)) {
    throw new Error('The catalog import response was invalid.');
  }
  return addCatalogDocumentToCollection(collectionStore, userId, importedDocument);
}

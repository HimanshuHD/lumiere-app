import assert from 'node:assert/strict';
import test from 'node:test';
import type { Document } from '../src/lib/supabase.ts';
import { importCatalogDocumentToCollection } from '../src/services/catalogImport.ts';

const catalogDocument = {
  id: 'catalog-123',
  title: 'Book',
  author: 'Author',
  category: 'Fiction',
  cover_url: null,
  reading_time: 1,
  summary: '',
  chapters: [],
  is_featured: false,
  created_at: '2026-11-02T00:00:00.000Z',
  origin: 'catalog_import',
  visibility: 'shared',
  uploaded_by: null,
} satisfies Document;

const request = {
  catalogUrl: 'https://m.gutenberg.org/ebooks.opds/',
  bookId: 'urn:book:123',
  downloadUrl: 'https://www.gutenberg.org/ebooks/123.epub3.images',
  format: 'epub',
} as const;

test('imports or reuses a canonical document before creating collection membership', async () => {
  const calls: string[] = [];
  const document = await importCatalogDocumentToCollection({
    async importOrReuseDocument(receivedRequest) {
      calls.push(`import:${receivedRequest.bookId}`);
      return catalogDocument;
    },
  }, {
    async addMembership(userId, documentId) {
      calls.push(`membership:${userId}:${documentId}`);
    },
    async removeMembership() {},
  }, 'user-123', request);

  assert.equal(document, catalogDocument);
  assert.deepEqual(calls, [
    'import:urn:book:123',
    'membership:user-123:catalog-123',
  ]);
});

test('does not create membership when import fails or returns a non-shared document', async () => {
  let membershipCreated = false;
  const collectionStore = {
    async addMembership() {
      membershipCreated = true;
    },
    async removeMembership() {},
  };

  await assert.rejects(
    importCatalogDocumentToCollection({
      async importOrReuseDocument() {
        throw new Error('import failed');
      },
    }, collectionStore, 'user-123', request),
    /import failed/,
  );
  await assert.rejects(
    importCatalogDocumentToCollection({
      async importOrReuseDocument() {
        return { ...catalogDocument, visibility: 'private' };
      },
    }, collectionStore, 'user-123', request),
    /response was invalid/,
  );
  assert.equal(membershipCreated, false);
});

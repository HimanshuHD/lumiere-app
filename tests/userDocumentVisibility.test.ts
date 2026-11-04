import assert from 'node:assert/strict';
import test from 'node:test';
import type { Document } from '../src/domain/documents.ts';
import { updateUserDocument } from '../src/services/userDocumentVisibility.ts';

const userDocument = {
  id: 'document-123',
  title: 'Book',
  author: 'Author',
  category: 'Fiction',
  cover_url: null,
  reading_time: 1,
  summary: '',
  chapters: [],
  is_featured: false,
  created_at: '2026-11-02T00:00:00.000Z',
  origin: 'user_upload',
  visibility: 'shared',
  uploaded_by: 'owner-123',
} satisfies Document;

test('updates metadata through the owner-scoped lifecycle store', async () => {
  const calls: unknown[] = [];
  const updatedDocument = { ...userDocument, visibility: 'private' };
  const result = await updateUserDocument({
    async updateOwnedDocument(userId, documentId, updates) {
      calls.push({ userId, documentId, updates });
      return updatedDocument;
    },
  }, 'owner-123', userDocument, {
    title: 'Book',
    author: 'Author',
    category: 'Fiction',
    summary: '',
    visibility: 'private',
  });

  assert.deepEqual(calls, [{
    userId: 'owner-123',
    documentId: userDocument.id,
    updates: {
      title: 'Book',
      author: 'Author',
      category: 'Fiction',
      summary: '',
      visibility: 'private',
    },
  }]);
  assert.equal(result.visibility, 'private');
});

test('rejects edits to catalog documents and documents owned by another user', async () => {
  let called = false;
  const store = {
    async updateOwnedDocument() {
      called = true;
      return userDocument;
    },
  };

  await assert.rejects(
    updateUserDocument(store, 'owner-123', {
      ...userDocument,
      origin: 'catalog_import',
    }, {
      title: 'Book',
      author: 'Author',
      category: 'Fiction',
      summary: '',
      visibility: 'private',
    }),
    /Only the owner can edit/,
  );
  await assert.rejects(
    updateUserDocument(store, 'another-user', userDocument, {
      title: 'Book',
      author: 'Author',
      category: 'Fiction',
      summary: '',
      visibility: 'private',
    }),
    /Only the owner can edit/,
  );
  assert.equal(called, false);
});

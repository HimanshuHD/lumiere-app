import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document } from '../src/lib/supabase.ts';
import {
  addCatalogDocumentToCollection,
  removeCatalogDocumentFromCollection,
} from '../src/services/catalogCollection.ts';

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

describe('addCatalogDocumentToCollection', () => {
  it('creates membership for a shared canonical document without copying it', async () => {
    const calls: Array<{ userId: string; documentId: string }> = [];
    const result = await addCatalogDocumentToCollection({
      async addMembership(userId, documentId) {
        calls.push({ userId, documentId });
      },
    }, 'user-123', catalogDocument);

    assert.deepEqual(calls, [{ userId: 'user-123', documentId: catalogDocument.id }]);
    assert.equal(result, catalogDocument);
  });

  it('does not add private or user-upload documents to catalog collection', async () => {
    let called = false;
    const store = {
      async addMembership() {
        called = true;
      },
    };

    await assert.rejects(
      addCatalogDocumentToCollection(store, 'user-123', {
        ...catalogDocument,
        visibility: 'private',
      }),
      /Only shared catalog documents/,
    );
    await assert.rejects(
      addCatalogDocumentToCollection(store, 'user-123', {
        ...catalogDocument,
        origin: 'user_upload',
      }),
      /Only shared catalog documents/,
    );
    assert.equal(called, false);
  });

  it('surfaces membership persistence errors', async () => {
    await assert.rejects(
      addCatalogDocumentToCollection({
        async addMembership() {
          throw new Error('Membership insert failed.');
        },
      }, 'user-123', catalogDocument),
      /Membership insert failed/,
    );
  });

  it('removes only the requesting user membership for a shared catalog document', async () => {
    const calls: Array<{ userId: string; documentId: string }> = [];
    await removeCatalogDocumentFromCollection({
      async addMembership() {},
      async removeMembership(userId, documentId) {
        calls.push({ userId, documentId });
      },
    }, 'user-456', catalogDocument);

    assert.deepEqual(calls, [{ userId: 'user-456', documentId: catalogDocument.id }]);
  });

  it('rejects removal of a user upload from the catalog collection', async () => {
    let called = false;
    await assert.rejects(
      removeCatalogDocumentFromCollection({
        async addMembership() {},
        async removeMembership() {
          called = true;
        },
      }, 'user-123', {
        ...catalogDocument,
        origin: 'user_upload',
      }),
      /Only shared catalog documents/,
    );
    assert.equal(called, false);
  });
});

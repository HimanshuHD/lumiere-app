import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document } from '../src/lib/supabase.ts';
import {
  DocumentLifecycleError,
  uploadUserDocument,
  type DocumentLifecycleDatabase,
  type DocumentLifecycleStorage,
  type UserDocumentInsert,
} from '../src/services/documentLifecycle.ts';

const operationId = 'operation-123';
const userId = 'user-123';
const documentFile = { name: 'book.pdf' } as File;
const coverFile = { name: 'cover.jpg' } as File;
const metadata = {
  title: 'Book',
  author: 'Author',
  category: 'Fiction',
  summary: '',
  cover_url: null,
  reading_time: 2,
  chapters: [],
  is_featured: false,
  page_count: 4,
  visibility: 'private' as const,
  file_format: 'pdf',
  file_name: 'book.pdf',
};

function savedDocument(input: UserDocumentInsert): Document {
  return {
    ...input,
    created_at: '2026-11-02T00:00:00.000Z',
  };
}

function createHarness(options: {
  insert?: (input: UserDocumentInsert) => Promise<Document>;
  findById?: (id: string) => Promise<Document | null>;
  upload?: (path: string, file: File) => Promise<void>;
  remove?: (paths: string[]) => Promise<void>;
} = {}) {
  const uploads: string[] = [];
  const removals: string[][] = [];
  const storage: DocumentLifecycleStorage = {
    async upload(path, file) {
      uploads.push(path);
      await options.upload?.(path, file);
    },
    async remove(paths) {
      removals.push(paths);
      await options.remove?.(paths);
    },
  };
  const database: DocumentLifecycleDatabase = {
    async findById(id) {
      return options.findById?.(id) ?? null;
    },
    async insert(input) {
      return options.insert ? options.insert(input) : savedDocument(input);
    },
  };
  return { database, storage, uploads, removals };
}

describe('uploadUserDocument', () => {
  it('creates a document with explicit storage paths and ownership', async () => {
    const harness = createHarness();
    const document = await uploadUserDocument(harness, {
      operationId,
      userId,
      documentFile,
      coverFile,
      metadata,
    });

    assert.equal(document.id, operationId);
    assert.equal(document.uploaded_by, userId);
    assert.equal(document.file_storage_path, `${userId}/${operationId}.pdf`);
    assert.equal(document.cover_storage_path, `${userId}/${operationId}-cover.jpg`);
    assert.deepEqual(harness.removals, []);
  });

  it('reconciles an ambiguous insert response instead of removing saved objects', async () => {
    let committed: Document | null = null;
    const harness = createHarness({
      async insert(input) {
        committed = savedDocument(input);
        throw new Error('Connection closed before the response arrived.');
      },
      async findById() {
        return committed;
      },
    });

    const document = await uploadUserDocument(harness, {
      operationId,
      userId,
      documentFile,
      coverFile,
      metadata,
    });

    assert.equal(document.id, operationId);
    assert.deepEqual(harness.removals, []);
  });

  it('removes only objects created by the failed operation', async () => {
    const harness = createHarness({
      async insert() {
        throw new Error('Insert failed.');
      },
    });

    await assert.rejects(
      uploadUserDocument(harness, {
        operationId,
        userId,
        documentFile,
        coverFile,
        metadata,
      }),
      (error: unknown) => error instanceof DocumentLifecycleError &&
        error.stage === 'document-insert' &&
        error.recoveryPaths.length === 0,
    );

    assert.deepEqual(harness.removals, [[
      `${userId}/${operationId}.pdf`,
      `${userId}/${operationId}-cover.jpg`,
    ]]);
  });

  it('cleans up the uploaded document when the cover upload fails and retains its uncertain path', async () => {
    const harness = createHarness({
      async upload(path) {
        if (path.endsWith('-cover.jpg')) throw new Error('Cover upload response was lost.');
      },
    });

    await assert.rejects(
      uploadUserDocument(harness, {
        operationId,
        userId,
        documentFile,
        coverFile,
        metadata,
      }),
      (error: unknown) => error instanceof DocumentLifecycleError &&
        error.stage === 'cover-upload' &&
        error.recoveryPaths.includes(`${userId}/${operationId}-cover.jpg`) &&
        error.cleanupPendingPaths.length === 0,
    );

    assert.deepEqual(harness.removals, [[`${userId}/${operationId}.pdf`]]);
  });

  it('retains failed cleanup paths for recovery', async () => {
    const harness = createHarness({
      async insert() {
        throw new Error('Insert failed.');
      },
      async remove() {
        throw new Error('Storage unavailable.');
      },
    });

    await assert.rejects(
      uploadUserDocument(harness, {
        operationId,
        userId,
        documentFile,
        coverFile,
        metadata,
      }),
      (error: unknown) => error instanceof DocumentLifecycleError &&
        error.cleanupPendingPaths.length === 2 &&
        error.recoveryPaths.includes(`${userId}/${operationId}.pdf`) &&
        error.message.includes('Storage unavailable'),
    );
  });

  it('does not upload files again when a retry finds its completed operation', async () => {
    const existing = savedDocument({
      ...metadata,
      id: operationId,
      origin: 'user_upload',
      uploaded_by: userId,
      file_storage_path: `${userId}/${operationId}.pdf`,
      cover_storage_path: null,
    });
    const harness = createHarness({ async findById() { return existing; } });

    const document = await uploadUserDocument(harness, {
      operationId,
      userId,
      documentFile,
      coverFile: null,
      metadata: { ...metadata, file_format: 'pdf' },
    });

    assert.equal(document.id, operationId);
    assert.deepEqual(harness.uploads, []);
  });
});

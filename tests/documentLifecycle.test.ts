import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { Document } from '../src/lib/supabase.ts';
import {
  DocumentLifecycleError,
  recoverPendingUserUploadFiles,
  uploadUserDocument,
  type DocumentLifecycleDatabase,
  type DocumentLifecycleStorage,
  type UserDocumentInsert,
  type UserUploadRecovery,
} from '../src/services/documentLifecycle.ts';

const operationId = 'operation-123';
const userId = 'user-123';
const documentFile = new File(['%PDF-1.7'], 'book.pdf', { type: 'application/pdf' });
const coverFile = new File([new Uint8Array([
  0xff, 0xd8, 0xff, 0xd8,
])], 'cover.jpg', { type: 'image/jpeg' });
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
  saveRecoveryRecords?: (records: UserUploadRecovery[]) => Promise<void>;
  listPendingRecoveryRecords?: (id: string) => Promise<UserUploadRecovery[]>;
  markRecoveryRecordCompleted?: (record: UserUploadRecovery) => Promise<void>;
  recordRecoveryAttempt?: (record: UserUploadRecovery, error: string) => Promise<void>;
} = {}) {
  const uploads: string[] = [];
  const removals: string[][] = [];
  const recoveryRecords: UserUploadRecovery[] = [];
  const completedRecoveryRecords: UserUploadRecovery[] = [];
  const recoveryAttempts: Array<{ record: UserUploadRecovery; error: string }> = [];
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
    async saveRecoveryRecords(records) {
      recoveryRecords.push(...records);
      await options.saveRecoveryRecords?.(records);
    },
    async listPendingRecoveryRecords(id) {
      return options.listPendingRecoveryRecords?.(id) ?? [];
    },
    async markRecoveryRecordCompleted(record) {
      completedRecoveryRecords.push(record);
      await options.markRecoveryRecordCompleted?.(record);
    },
    async recordRecoveryAttempt(record, error) {
      recoveryAttempts.push({ record, error });
      await options.recordRecoveryAttempt?.(record, error);
    },
  };
  return {
    database,
    storage,
    uploads,
    removals,
    recoveryRecords,
    completedRecoveryRecords,
    recoveryAttempts,
  };
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
    assert.deepEqual(harness.recoveryRecords, []);
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
    assert.equal(harness.recoveryRecords.length, 1);
    assert.equal(harness.recoveryRecords[0].status, 'cleanup_pending');
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
    assert.equal(harness.recoveryRecords.length, 2);
    assert.ok(harness.recoveryRecords.every((record) => record.lastError === 'Storage unavailable.'));
  });

  it('persists uncertain files when the database insert cannot be reconciled', async () => {
    let lookups = 0;
    const harness = createHarness({
      async insert() {
        throw new Error('Insert response was lost.');
      },
      async findById() {
        lookups += 1;
        if (lookups === 1) return null;
        throw new Error('Database lookup unavailable.');
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
        error.stage === 'reconciliation' &&
        error.message.includes('Could not confirm whether the document was saved'),
    );

    assert.equal(harness.recoveryRecords.length, 2);
    assert.ok(harness.recoveryRecords.every((record) => record.status === 'reconciliation_pending'));
    assert.deepEqual(harness.removals, []);
  });

  it('surfaces when durable recovery tracking itself fails', async () => {
    const harness = createHarness({
      async insert() {
        throw new Error('Insert failed.');
      },
      async remove() {
        throw new Error('Storage unavailable.');
      },
      async saveRecoveryRecords() {
        throw new Error('Database unavailable.');
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
        error.message.includes('Recovery tracking could not be saved: Database unavailable.'),
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

  it('retries persisted cleanup and marks the record complete', async () => {
    const record: UserUploadRecovery = {
      operationId,
      userId,
      storagePath: `${userId}/${operationId}.pdf`,
      stage: 'document-insert',
      status: 'cleanup_pending',
      lastError: 'Storage unavailable.',
      attempts: 2,
    };
    const harness = createHarness({
      async listPendingRecoveryRecords() { return [record]; },
      async findById() { return null; },
    });

    const result = await recoverPendingUserUploadFiles(harness, userId);

    assert.deepEqual(result, { recovered: 1, pending: 0 });
    assert.deepEqual(harness.removals, [[record.storagePath]]);
    assert.deepEqual(harness.completedRecoveryRecords, [record]);
    assert.deepEqual(harness.recoveryAttempts, []);
  });

  it('does not remove a recovery path attached to a saved document', async () => {
    const path = `${userId}/${operationId}.pdf`;
    const record: UserUploadRecovery = {
      operationId,
      userId,
      storagePath: path,
      stage: 'reconciliation',
      status: 'reconciliation_pending',
      lastError: 'Could not confirm the document save.',
      attempts: 0,
    };
    const document = savedDocument({
      ...metadata,
      id: operationId,
      origin: 'user_upload',
      uploaded_by: userId,
      file_storage_path: path,
      cover_storage_path: null,
    });
    const harness = createHarness({
      async listPendingRecoveryRecords() { return [record]; },
      async findById() { return document; },
    });

    const result = await recoverPendingUserUploadFiles(harness, userId);

    assert.deepEqual(result, { recovered: 1, pending: 0 });
    assert.deepEqual(harness.removals, []);
    assert.deepEqual(harness.completedRecoveryRecords, [record]);
  });

  it('retains and reports records whose recovery still fails', async () => {
    const record: UserUploadRecovery = {
      operationId,
      userId,
      storagePath: `${userId}/${operationId}.pdf`,
      stage: 'document-insert',
      status: 'cleanup_pending',
      lastError: 'Initial cleanup failed.',
      attempts: 0,
    };
    const harness = createHarness({
      async listPendingRecoveryRecords() { return [record]; },
      async findById() { return null; },
      async remove() { throw new Error('Storage unavailable again.'); },
    });

    const result = await recoverPendingUserUploadFiles(harness, userId);

    assert.deepEqual(result, { recovered: 0, pending: 1 });
    assert.equal(harness.recoveryAttempts[0].error, 'Storage unavailable again.');
  });
});


describe('retrying an ambiguous storage upload', () => {
  for (const lostStage of ['document', 'cover'] as const) {
    it(`recovers a committed ${lostStage} write before retrying the same operation`, async () => {
      const objects = new Set<string>();
      const pending = new Map<string, UserUploadRecovery>();
      let loseResponse = true;
      let saved: Document | null = null;
      const harness = createHarness({
        async upload(path) {
          if (objects.has(path)) throw new Error('The resource already exists.');
          objects.add(path);
          if (loseResponse && (path.includes('-cover') === (lostStage === 'cover'))) {
            loseResponse = false;
            throw new Error('Write committed but its response was lost.');
          }
        },
        async remove(paths) {
          for (const path of paths) objects.delete(path);
        },
        async saveRecoveryRecords(records) {
          for (const record of records) pending.set(record.storagePath, record);
        },
        async listPendingRecoveryRecords() { return [...pending.values()]; },
        async markRecoveryRecordCompleted(record) { pending.delete(record.storagePath); },
        async findById() { return saved; },
        async insert(input) { saved = savedDocument(input); return saved; },
      });
      const input = { operationId, userId, documentFile, coverFile, metadata };
      await assert.rejects(uploadUserDocument(harness, input), /response was lost/);
      const result = await uploadUserDocument(harness, input);
      assert.equal(result.id, operationId);
      assert.equal(pending.size, 0);
      assert.deepEqual([...objects].sort(), [
        `${userId}/${operationId}.pdf`, `${userId}/${operationId}-cover.jpg`,
      ].sort());
      const count = harness.uploads.length;
      assert.equal(await uploadUserDocument(harness, input), result);
      assert.equal(harness.uploads.length, count, 'completed retries never upload again');
    });
  }

  it('does not start another upload while cleanup still fails', async () => {
    const record: UserUploadRecovery = {
      operationId, userId, storagePath: `${userId}/${operationId}.pdf`,
      stage: 'document-upload', status: 'cleanup_pending', attempts: 0, lastError: 'Response lost',
    };
    const harness = createHarness({
      async listPendingRecoveryRecords() { return [record]; },
      async remove() { throw new Error('Storage unavailable'); },
    });
    await assert.rejects(uploadUserDocument(harness, {
      operationId, userId, documentFile, coverFile, metadata,
    }), /still has pending cleanup/);
    assert.deepEqual(harness.uploads, []);
    assert.equal(harness.recoveryAttempts.length, 1);
  });
});


describe('personal upload recovery isolation', () => {
  it('never processes catalog records even if an adapter returns mixed pending rows', async () => {
    const records = ['catalog-import', 'catalog-delete', 'document-upload'].map((stage) => ({
      operationId: stage === 'document-upload' ? operationId : `catalog-${stage}`,
      userId,
      storagePath: stage === 'document-upload' ? `${userId}/${operationId}.pdf` : `catalog/${stage}.epub`,
      stage,
      status: 'cleanup_pending',
      lastError: 'Previous failure',
      attempts: 0,
    })) as UserUploadRecovery[];
    const harness = createHarness({
      async listPendingRecoveryRecords() { return records; },
      async markRecoveryRecordCompleted(record) {
        assert.equal(record.stage, 'document-upload');
      },
      async recordRecoveryAttempt() { assert.fail('Catalog RLS must never be reached'); },
    });
    assert.deepEqual(await recoverPendingUserUploadFiles(harness, userId), { recovered: 1, pending: 0 });
    assert.deepEqual(harness.removals, [[`${userId}/${operationId}.pdf`]]);
    assert.equal(harness.completedRecoveryRecords.length, 1);
  });

  it('continues later personal recovery when recording an earlier failure also fails', async () => {
    const records = ['first', 'second'].map((suffix): UserUploadRecovery => ({
      operationId: suffix, userId, storagePath: `${userId}/${suffix}.pdf`,
      stage: 'document-upload', status: 'cleanup_pending', lastError: 'Previous failure', attempts: 0,
    }));
    const harness = createHarness({
      async listPendingRecoveryRecords() { return records; },
      async remove(paths) { if (paths[0].endsWith('first.pdf')) throw new Error('Storage unavailable'); },
      async recordRecoveryAttempt() { throw new Error('Recovery tracking unavailable'); },
    });
    const originalError = console.error;
    const logged: unknown[] = [];
    console.error = (...args: unknown[]) => { logged.push(args); };
    try {
      assert.deepEqual(await recoverPendingUserUploadFiles(harness, userId), { recovered: 1, pending: 1 });
    } finally { console.error = originalError; }
    assert.equal(harness.removals.length, 2);
    assert.equal(harness.completedRecoveryRecords[0].operationId, 'second');
    assert.equal(logged.length, 1);
  });
});

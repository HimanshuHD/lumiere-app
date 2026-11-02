import assert from 'node:assert/strict';
import test from 'node:test';
import {
  reconcileCatalogImportFailure,
  shouldDeferCatalogImportCleanup,
} from '../supabase/functions/_shared/catalog_import_recovery.ts';

interface CatalogDocument {
  id: string;
  file_storage_path: string | null;
}

test('keeps the uploaded file when the canonical document references it after an ambiguous insert', async () => {
  const document = { id: 'canonical', file_storage_path: 'catalog/import.epub' };
  const calls: string[] = [];

  const result = await reconcileCatalogImportFailure('catalog/import.epub', {
    async findCanonical() {
      calls.push('lookup');
      return document;
    },
    getFileStoragePath: (canonical) => canonical.file_storage_path,
    async removeUploadedFile() {
      calls.push('remove');
    },
    async recordRecovery() {
      calls.push('record');
    },
  });

  assert.deepEqual(result, { kind: 'reused', document });
  assert.deepEqual(calls, ['lookup']);
});

test('looks up the canonical record before cleaning a losing concurrent import file', async () => {
  const document = { id: 'winner', file_storage_path: 'catalog/winner.epub' };
  const calls: string[] = [];

  const result = await reconcileCatalogImportFailure('catalog/loser.epub', {
    async findCanonical() {
      calls.push('lookup');
      return document;
    },
    getFileStoragePath: (canonical) => canonical.file_storage_path,
    async removeUploadedFile() {
      calls.push('remove');
    },
    async recordRecovery() {
      calls.push('record');
    },
  });

  assert.deepEqual(result, { kind: 'reused', document });
  assert.deepEqual(calls, ['lookup', 'remove']);
});

test('retains the file and records reconciliation when canonical lookup fails', async () => {
  const calls: string[] = [];

  const result = await reconcileCatalogImportFailure('catalog/uncertain.epub', {
    async findCanonical() {
      calls.push('lookup');
      throw new Error('database unavailable');
    },
    getFileStoragePath: (canonical: CatalogDocument) => canonical.file_storage_path,
    async removeUploadedFile() {
      calls.push('remove');
    },
    async recordRecovery(status, error) {
      calls.push(`${status}:${error}`);
    },
  });

  assert.equal(result.kind, 'pending');
  assert.match(result.error, /retained for safe reconciliation/);
  assert.deepEqual(calls, [
    'lookup',
    'reconciliation_pending:Could not determine whether the uploaded file was saved: database unavailable',
  ]);
});

test('records retryable cleanup when no canonical record references the uploaded file', async () => {
  const calls: string[] = [];

  const result = await reconcileCatalogImportFailure('catalog/orphan.epub', {
    async findCanonical() {
      calls.push('lookup');
      return null;
    },
    getFileStoragePath: (canonical: CatalogDocument) => canonical.file_storage_path,
    async removeUploadedFile() {
      calls.push('remove');
      throw new Error('storage unavailable');
    },
    async recordRecovery(status, error) {
      calls.push(`${status}:${error}`);
    },
  });

  assert.equal(result.kind, 'pending');
  assert.match(result.error, /queued for retry/);
  assert.deepEqual(calls, ['lookup', 'remove', 'cleanup_pending:storage unavailable']);
});

test('surfaces recovery-record failures instead of hiding orphaned files', async () => {
  const result = await reconcileCatalogImportFailure('catalog/orphan.epub', {
    async findCanonical() {
      return null;
    },
    getFileStoragePath: (canonical: CatalogDocument) => canonical.file_storage_path,
    async removeUploadedFile() {
      throw new Error('storage unavailable');
    },
    async recordRecovery() {
      throw new Error('database unavailable');
    },
  });

  assert.equal(result.kind, 'pending');
  assert.match(result.error, /Recovery tracking also failed: database unavailable/);
});

test('defers unreferenced reconciliation records once before cleanup can be retried', () => {
  assert.equal(shouldDeferCatalogImportCleanup('reconciliation_pending', 0), true);
  assert.equal(shouldDeferCatalogImportCleanup('reconciliation_pending', 1), false);
  assert.equal(shouldDeferCatalogImportCleanup('cleanup_pending', 0), false);
});

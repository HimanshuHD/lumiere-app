import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import type { DocumentLifecycleDependencies, UserUploadRecovery } from '../src/services/documentLifecycle.ts';
import {
  deleteOwnedUserDocument,
  getUserDocumentDeletionImpact,
  type UserDocumentDeletionImpact,
  type UserDocumentDeletionStore,
} from '../src/services/userDocumentDeletion.ts';

const userId = 'owner-id';
const documentId = 'document-operation-id';
const impact: UserDocumentDeletionImpact = {
  title: 'Book',
  bookmarkUsers: 2,
  readingUsers: 1,
  readingListUsers: 2,
};

function createRecoveryDependencies(
  options: { remove?: (paths: string[]) => Promise<void> } = {},
): DocumentLifecycleDependencies {
  const record: UserUploadRecovery = {
    userId,
    operationId: documentId,
    storagePath: `${userId}/book.pdf`,
    stage: 'document-delete',
    status: 'cleanup_pending',
    lastError: 'Document deleted; storage cleanup is pending.',
    attempts: 0,
  };
  return {
    storage: {
      async upload() {},
      async remove(paths) {
        await options.remove?.(paths);
      },
    },
    database: {
      async findById() {
        return null;
      },
      async insert() {
        throw new Error('Not used by deletion recovery.');
      },
      async saveRecoveryRecords() {},
      async listPendingRecoveryRecords() {
        return [record];
      },
      async markRecoveryRecordCompleted() {},
      async recordRecoveryAttempt() {},
    },
  };
}

describe('user document deletion', () => {
  it('loads the owner-authorized deletion impact', async () => {
    const calls: string[] = [];
    const store: UserDocumentDeletionStore = {
      async getDeletionImpact(id) {
        calls.push(`preview:${id}`);
        return impact;
      },
      async deleteOwnedUpload() {
        throw new Error('Not expected to delete.');
      },
    };

    assert.deepEqual(await getUserDocumentDeletionImpact(store, documentId), impact);
    assert.deepEqual(calls, [`preview:${documentId}`]);
  });

  it('runs durable storage recovery after the database deletion', async () => {
    const calls: string[] = [];
    const store: UserDocumentDeletionStore = {
      async getDeletionImpact() {
        throw new Error('Not used.');
      },
      async deleteOwnedUpload(id) {
        calls.push(`delete:${id}`);
        return impact;
      },
    };
    const dependencies = createRecoveryDependencies({
      async remove(paths) {
        calls.push(`remove:${paths.join(',')}`);
      },
    });

    const result = await deleteOwnedUserDocument(store, dependencies, userId, documentId);

    assert.deepEqual(calls, [
      `delete:${documentId}`,
      `remove:${userId}/book.pdf`,
    ]);
    assert.equal(result.impact, impact);
    assert.deepEqual(result.cleanup, {
      status: 'completed',
      recovery: { recovered: 1, pending: 0 },
    });
  });

  it('reports pending cleanup without misreporting a failed storage removal as success', async () => {
    const store: UserDocumentDeletionStore = {
      async getDeletionImpact() {
        throw new Error('Not used.');
      },
      async deleteOwnedUpload() {
        return impact;
      },
    };
    const dependencies = createRecoveryDependencies({
      async remove() {
        throw new Error('Storage unavailable.');
      },
    });

    const result = await deleteOwnedUserDocument(store, dependencies, userId, documentId);

    assert.equal(result.cleanup.status, 'pending');
    if (result.cleanup.status === 'pending') {
      assert.deepEqual(result.cleanup.recovery, { recovered: 0, pending: 1 });
    }
  });
});

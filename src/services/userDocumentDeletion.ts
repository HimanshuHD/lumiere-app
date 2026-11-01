import type { DocumentLifecycleDependencies, UserUploadRecoveryResult } from './documentLifecycle.ts';
import { recoverPendingUserUploadFiles } from './documentLifecycle.ts';

export interface UserDocumentDeletionImpact {
  title: string;
  bookmarkUsers: number;
  readingUsers: number;
  readingListUsers: number;
}

export interface UserDocumentDeletionStore {
  getDeletionImpact(documentId: string): Promise<UserDocumentDeletionImpact>;
  deleteOwnedUpload(documentId: string): Promise<UserDocumentDeletionImpact>;
}

export interface UserDocumentDeletionResult {
  impact: UserDocumentDeletionImpact;
  cleanup:
    | { status: 'completed'; recovery: UserUploadRecoveryResult }
    | { status: 'pending'; recovery?: UserUploadRecoveryResult; error?: string };
}

export async function getUserDocumentDeletionImpact(
  store: UserDocumentDeletionStore,
  documentId: string,
): Promise<UserDocumentDeletionImpact> {
  return store.getDeletionImpact(documentId);
}

export async function deleteOwnedUserDocument(
  store: UserDocumentDeletionStore,
  recoveryDependencies: DocumentLifecycleDependencies,
  userId: string,
  documentId: string,
): Promise<UserDocumentDeletionResult> {
  const impact = await store.deleteOwnedUpload(documentId);
  try {
    const recovery = await recoverPendingUserUploadFiles(recoveryDependencies, userId, documentId);
    return recovery.pending > 0
      ? { impact, cleanup: { status: 'pending', recovery } }
      : { impact, cleanup: { status: 'completed', recovery } };
  } catch (error) {
    return {
      impact,
      cleanup: {
        status: 'pending',
        error: error instanceof Error ? error.message : 'Storage cleanup could not be completed.',
      },
    };
  }
}

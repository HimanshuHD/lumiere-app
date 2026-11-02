import type { Document } from '@/lib/supabase';
import {
  getCoverContentType,
  getDocumentContentType,
  validateCoverFile,
  validateDocumentFile,
} from './documentValidation.ts';

export type UserUploadStage =
  | 'document-lookup'
  | 'document-upload'
  | 'cover-upload'
  | 'document-insert'
  | 'reconciliation'
  | 'document-delete';

export type UserDocumentMetadata = Pick<
  Document,
  | 'title'
  | 'author'
  | 'category'
  | 'summary'
  | 'cover_url'
  | 'reading_time'
  | 'chapters'
  | 'is_featured'
  | 'page_count'
  | 'visibility'
  | 'file_format'
  | 'file_name'
>;

export type UserDocumentInsert = UserDocumentMetadata & {
  id: string;
  origin: 'user_upload';
  uploaded_by: string;
  file_storage_path: string;
  cover_storage_path: string | null;
};

export interface DocumentLifecycleStorage {
  upload(path: string, file: File, contentType: string): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface DocumentLifecycleDatabase {
  findById(id: string): Promise<Document | null>;
  insert(document: UserDocumentInsert): Promise<Document>;
  saveRecoveryRecords(records: UserUploadRecovery[]): Promise<void>;
  listPendingRecoveryRecords(userId: string): Promise<UserUploadRecovery[]>;
  markRecoveryRecordCompleted(record: UserUploadRecovery): Promise<void>;
  recordRecoveryAttempt(record: UserUploadRecovery, error: string): Promise<void>;
}

export interface DocumentLifecycleDependencies {
  storage: DocumentLifecycleStorage;
  database: DocumentLifecycleDatabase;
}

export interface UserDocumentUpload {
  operationId: string;
  userId: string;
  documentFile: File;
  coverFile: File | null;
  metadata: UserDocumentMetadata;
}

export interface UserUploadRecovery {
  operationId: string;
  userId: string;
  storagePath: string;
  stage: UserUploadStage;
  status: 'cleanup_pending' | 'reconciliation_pending';
  lastError: string;
  attempts: number;
}

export interface UserUploadRecoveryResult {
  recovered: number;
  pending: number;
}

export class DocumentLifecycleError extends Error {
  readonly operationId: string;
  readonly stage: UserUploadStage;
  readonly recoveryPaths: string[];
  readonly cleanupPendingPaths: string[];
  readonly originalError?: unknown;

  constructor(
    message: string,
    operationId: string,
    stage: UserUploadStage,
    recoveryPaths: string[] = [],
    cleanupPendingPaths: string[] = [],
    originalError?: unknown,
  ) {
    super(message);
    this.name = 'DocumentLifecycleError';
    this.operationId = operationId;
    this.stage = stage;
    this.recoveryPaths = recoveryPaths;
    this.cleanupPendingPaths = cleanupPendingPaths;
    this.originalError = originalError;
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function matchesUpload(
  document: Document | null,
  userId: string,
  filePath: string,
  coverPath: string | null,
): document is Document {
  return document?.id !== undefined &&
    document.origin === 'user_upload' &&
    document.uploaded_by === userId &&
    document.file_storage_path === filePath &&
    (document.cover_storage_path ?? null) === coverPath;
}

function getExtension(file: File): string {
  return file.name.split('.').pop()?.toLowerCase() || 'bin';
}

function getRecoveryRecord(
  operationId: string,
  userId: string,
  storagePath: string,
  stage: UserUploadStage,
  status: UserUploadRecovery['status'],
  lastError: string,
): UserUploadRecovery {
  return { operationId, userId, storagePath, stage, status, lastError, attempts: 0 };
}

export async function recoverPendingUserUploadFiles(
  dependencies: DocumentLifecycleDependencies,
  userId: string,
  operationId?: string,
): Promise<UserUploadRecoveryResult> {
  const allPendingRecords = await dependencies.database.listPendingRecoveryRecords(userId);
  const pendingRecords = operationId
    ? allPendingRecords.filter((record) => record.operationId === operationId)
    : allPendingRecords;
  let recovered = 0;
  let pending = 0;

  for (const record of pendingRecords) {
    try {
      const document = await dependencies.database.findById(record.operationId);
      if (document) {
        const ownsDocument = document.origin === 'user_upload' && document.uploaded_by === userId;
        const pathIsAttached = document.file_storage_path === record.storagePath ||
          document.cover_storage_path === record.storagePath;
        if (ownsDocument && pathIsAttached) {
          await dependencies.database.markRecoveryRecordCompleted(record);
          recovered += 1;
          continue;
        }
        throw new Error('The recovery path is associated with a different document; no file was removed.');
      }

      await dependencies.storage.remove([record.storagePath]);
      await dependencies.database.markRecoveryRecordCompleted(record);
      recovered += 1;
    } catch (error) {
      pending += 1;
      await dependencies.database.recordRecoveryAttempt(record, errorMessage(error));
    }
  }

  return { recovered, pending };
}

export async function uploadUserDocument(
  dependencies: DocumentLifecycleDependencies,
  upload: UserDocumentUpload,
): Promise<Document> {
  const { operationId, userId, documentFile, coverFile, metadata } = upload;
  const documentPath = `${userId}/${operationId}.${getExtension(documentFile)}`;
  const coverPath = coverFile
    ? `${userId}/${operationId}-cover.${getExtension(coverFile)}`
    : null;
  let stage: UserUploadStage = 'document-lookup';
  const createdPaths: string[] = [];

  const documentFormat = await validateDocumentFile(documentFile);
  const coverFormat = coverFile ? await validateCoverFile(coverFile) : null;

  try {
    const existing = await dependencies.database.findById(operationId);
    if (existing) {
      if (matchesUpload(existing, userId, documentPath, coverPath)) return existing;
      throw new DocumentLifecycleError(
        'This upload operation ID is already associated with a different document.',
        operationId,
        stage,
      );
    }

    // A previous storage write may have committed before its response was lost.
    // Reconcile the same operation before reusing its paths (uploads never upsert).
    const recovery = await recoverPendingUserUploadFiles(dependencies, userId, operationId);
    if (recovery.pending > 0) {
      throw new DocumentLifecycleError(
        'This upload still has pending cleanup. Retry when storage access is available; no new files were uploaded.',
        operationId,
        'reconciliation',
      );
    }
    if (recovery.recovered > 0) {
      const reconciled = await dependencies.database.findById(operationId);
      if (reconciled) {
        if (matchesUpload(reconciled, userId, documentPath, coverPath)) return reconciled;
        throw new DocumentLifecycleError(
          'This upload operation ID is already associated with a different document.',
          operationId,
          'reconciliation',
        );
      }
    }

    stage = 'document-upload';
    await dependencies.storage.upload(
      documentPath,
      documentFile,
      getDocumentContentType(documentFormat),
    );
    createdPaths.push(documentPath);

    if (coverFile && coverPath && coverFormat) {
      stage = 'cover-upload';
      await dependencies.storage.upload(
        coverPath,
        coverFile,
        getCoverContentType(coverFormat),
      );
      createdPaths.push(coverPath);
    }

    stage = 'document-insert';
    return await dependencies.database.insert({
      ...metadata,
      id: operationId,
      origin: 'user_upload',
      uploaded_by: userId,
      file_storage_path: documentPath,
      cover_storage_path: coverPath,
    });
  } catch (error) {
    if (error instanceof DocumentLifecycleError) throw error;

    const uncertainPaths = stage === 'document-upload'
      ? [documentPath]
      : stage === 'cover-upload' && coverPath
        ? [coverPath]
        : [];

    if (stage === 'document-insert') {
      try {
        const savedDocument = await dependencies.database.findById(operationId);
        if (matchesUpload(savedDocument, userId, documentPath, coverPath)) return savedDocument;
      } catch (reconciliationError) {
        const recoveryRecords = createdPaths.map((path) =>
          getRecoveryRecord(
            operationId,
            userId,
            path,
            stage,
            'reconciliation_pending',
            errorMessage(reconciliationError),
          )
        );
        let recoveryMessage = '';
        if (recoveryRecords.length > 0) {
          try {
            await dependencies.database.saveRecoveryRecords(recoveryRecords);
          } catch (recoverySaveError) {
            recoveryMessage = ` Recovery tracking could not be saved: ${errorMessage(recoverySaveError)}.`;
          }
        }
        throw new DocumentLifecycleError(
          `Could not confirm whether the document was saved: ${errorMessage(reconciliationError)}.${recoveryMessage}`,
          operationId,
          'reconciliation',
          createdPaths,
          [],
          reconciliationError,
        );
      }
    }

    let cleanupError: unknown;
    if (createdPaths.length > 0) {
      try {
        await dependencies.storage.remove(createdPaths);
      } catch (errorDuringCleanup) {
        cleanupError = errorDuringCleanup;
      }
    }

    const recoveryRecords = [
      ...(cleanupError
        ? createdPaths.map((path) =>
          getRecoveryRecord(
            operationId,
            userId,
            path,
            stage,
            'cleanup_pending',
            errorMessage(cleanupError),
          )
        )
        : []),
      ...uncertainPaths.map((path) =>
        getRecoveryRecord(
          operationId,
          userId,
          path,
          stage,
          'cleanup_pending',
          errorMessage(error),
        )
      ),
    ];
    let recoverySaveError: unknown;
    if (recoveryRecords.length > 0) {
      try {
        await dependencies.database.saveRecoveryRecords(recoveryRecords);
      } catch (errorDuringRecoverySave) {
        recoverySaveError = errorDuringRecoverySave;
      }
    }

    const message = cleanupError
      ? `Upload failed during ${stage}: ${errorMessage(error)}. Cleanup also failed: ${errorMessage(cleanupError)}`
      : `Upload failed during ${stage}: ${errorMessage(error)}`;
    const recoveryMessage = recoverySaveError
      ? ` Recovery tracking could not be saved: ${errorMessage(recoverySaveError)}.`
      : '';
    throw new DocumentLifecycleError(
      `${message}${recoveryMessage}`,
      operationId,
      stage,
      [...(cleanupError ? createdPaths : []), ...uncertainPaths],
      cleanupError ? createdPaths : [],
      error,
    );
  }
}

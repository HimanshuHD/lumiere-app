import type { Document } from '@/lib/supabase';

export type UserUploadStage =
  | 'document-lookup'
  | 'document-upload'
  | 'cover-upload'
  | 'document-insert'
  | 'reconciliation';

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
  upload(path: string, file: File): Promise<void>;
  remove(paths: string[]): Promise<void>;
}

export interface DocumentLifecycleDatabase {
  findById(id: string): Promise<Document | null>;
  insert(document: UserDocumentInsert): Promise<Document>;
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

    stage = 'document-upload';
    await dependencies.storage.upload(documentPath, documentFile);
    createdPaths.push(documentPath);

    if (coverFile && coverPath) {
      stage = 'cover-upload';
      await dependencies.storage.upload(coverPath, coverFile);
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
        throw new DocumentLifecycleError(
          `Could not confirm whether the document was saved: ${errorMessage(reconciliationError)}`,
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

    const message = cleanupError
      ? `Upload failed during ${stage}: ${errorMessage(error)}. Cleanup also failed: ${errorMessage(cleanupError)}`
      : `Upload failed during ${stage}: ${errorMessage(error)}`;
    throw new DocumentLifecycleError(
      message,
      operationId,
      stage,
      [...(cleanupError ? createdPaths : []), ...uncertainPaths],
      cleanupError ? createdPaths : [],
      error,
    );
  }
}

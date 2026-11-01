import { supabase, type Document } from '@/lib/supabase';
import type {
  DocumentLifecycleDependencies,
  UserDocumentInsert,
  UserUploadRecovery,
} from '@/services/documentLifecycle';

interface RecoveryRow {
  user_id: string;
  operation_id: string;
  storage_path: string;
  failure_stage: UserUploadRecovery['stage'];
  status: UserUploadRecovery['status'];
  last_error: string | null;
  attempts: number;
}

function throwOnError(error: { message: string } | null, action: string): void {
  if (error) throw new Error(`${action}: ${error.message}`);
}

function toRecoveryRecord(row: RecoveryRow): UserUploadRecovery {
  return {
    userId: row.user_id,
    operationId: row.operation_id,
    storagePath: row.storage_path,
    stage: row.failure_stage,
    status: row.status,
    lastError: row.last_error ?? 'Previous cleanup attempt failed.',
    attempts: row.attempts,
  };
}

export const supabaseDocumentLifecycleDependencies: DocumentLifecycleDependencies = {
  storage: {
    async upload(path, file, contentType) {
      const { error } = await supabase.storage.from('documents').upload(path, file, { contentType });
      throwOnError(error, 'Could not upload storage object');
    },
    async remove(paths) {
      const { error } = await supabase.storage.from('documents').remove(paths);
      throwOnError(error, 'Could not remove storage object');
    },
  },
  database: {
    async findById(id) {
      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', id)
        .maybeSingle();
      throwOnError(error, 'Could not look up document');
      return data as Document | null;
    },
    async insert(document: UserDocumentInsert) {
      const { chapters, ...payload } = document;
      void chapters;
      const { data: finalized, error: finalizeError } = await supabase.functions.invoke<{ id: string }>(
        'finalize-user-document-upload',
        { body: { document: payload } },
      );
      if (finalizeError) {
        throw new Error(`Could not validate and finalize the uploaded document: ${finalizeError.message}`);
      }
      if (finalized?.id !== document.id) {
        throw new Error('The upload service did not confirm document finalization.');
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('id', document.id)
        .single();
      throwOnError(error, 'Could not load finalized document');
      if (!data) throw new Error('The saved document was not returned.');
      return data as Document;
    },
    async saveRecoveryRecords(records) {
      const rows = records.map((record) => ({
        user_id: record.userId,
        operation_id: record.operationId,
        storage_path: record.storagePath,
        failure_stage: record.stage,
        status: record.status,
        last_error: record.lastError,
      }));
      const { error } = await supabase
        .from('document_lifecycle_recovery')
        .upsert(rows, { onConflict: 'user_id,operation_id,storage_path' });
      throwOnError(error, 'Could not save upload recovery details');
    },
    async listPendingRecoveryRecords(userId) {
      const { data, error } = await supabase
        .from('document_lifecycle_recovery')
        .select('user_id, operation_id, storage_path, failure_stage, status, last_error, attempts')
        .eq('user_id', userId)
        .in('status', ['cleanup_pending', 'reconciliation_pending'])
        .order('created_at', { ascending: true });
      throwOnError(error, 'Could not load upload recovery details');
      return ((data ?? []) as RecoveryRow[]).map(toRecoveryRecord);
    },
    async markRecoveryRecordCompleted(record) {
      const { data, error } = await supabase
        .from('document_lifecycle_recovery')
        .update({ status: 'completed', last_error: null, updated_at: new Date().toISOString() })
        .eq('user_id', record.userId)
        .eq('operation_id', record.operationId)
        .eq('storage_path', record.storagePath)
        .select('storage_path')
        .maybeSingle();
      throwOnError(error, 'Could not complete upload recovery');
      if (!data) throw new Error('The upload recovery record no longer exists.');
    },
    async recordRecoveryAttempt(record, errorMessage) {
      const { data, error } = await supabase
        .from('document_lifecycle_recovery')
        .update({
          last_error: errorMessage,
          attempts: record.attempts + 1,
          updated_at: new Date().toISOString(),
        })
        .eq('user_id', record.userId)
        .eq('operation_id', record.operationId)
        .eq('storage_path', record.storagePath)
        .select('storage_path')
        .maybeSingle();
      throwOnError(error, 'Could not record upload recovery attempt');
      if (!data) throw new Error('The upload recovery record no longer exists.');
    },
  },
};

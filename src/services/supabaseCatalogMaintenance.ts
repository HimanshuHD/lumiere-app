import { supabase } from '@/lib/supabase';
import type {
  CatalogCleanupResult,
  CatalogDocumentDeletionImpact,
  CatalogMaintenanceStore,
} from '@/services/catalogMaintenance';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseImpact(value: unknown): CatalogDocumentDeletionImpact {
  if (!isRecord(value)) throw new Error('The server returned invalid catalog deletion details.');
  const { title, bookmark_users, reading_users, reading_list_users } = value;
  if (
    typeof title !== 'string'
    || !Number.isSafeInteger(bookmark_users)
    || !Number.isSafeInteger(reading_users)
    || !Number.isSafeInteger(reading_list_users)
    || Number(bookmark_users) < 0
    || Number(reading_users) < 0
    || Number(reading_list_users) < 0
  ) {
    throw new Error('The server returned invalid catalog deletion details.');
  }
  return {
    title,
    bookmarkUsers: Number(bookmark_users),
    readingUsers: Number(reading_users),
    readingListUsers: Number(reading_list_users),
  };
}

function parseCleanup(value: unknown, error?: unknown): CatalogCleanupResult {
  if (!isRecord(value)) throw new Error('The server returned invalid catalog cleanup details.');
  const { completed, pending } = value;
  if (
    !Number.isSafeInteger(completed)
    || !Number.isSafeInteger(pending)
    || Number(completed) < 0
    || Number(pending) < 0
  ) {
    throw new Error('The server returned invalid catalog cleanup details.');
  }
  const responseError = typeof value.error === 'string' ? value.error : undefined;
  const fallbackError = error instanceof Error ? error.message : undefined;
  return {
    completed: Number(completed),
    pending: Number(pending),
    ...(responseError || fallbackError ? { error: responseError ?? fallbackError } : {}),
  };
}

async function invokeMaintenance(
  body: Record<string, string>,
): Promise<Record<string, unknown>> {
  const { data, error } = await supabase.functions.invoke<unknown>(
    'admin-catalog-maintenance',
    { body },
  );
  if (error) throw new Error(`Catalog maintenance request failed: ${error.message}`);
  if (!isRecord(data)) throw new Error('The catalog maintenance service returned an invalid response.');
  return data;
}

export const supabaseCatalogMaintenanceStore: CatalogMaintenanceStore = {
  async getDeletionImpact(documentId) {
    const { data, error } = await supabase.rpc('get_catalog_document_deletion_impact', {
      p_document_id: documentId,
    });
    if (error) throw new Error(`Could not load catalog deletion details: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1) {
      throw new Error('The server did not return catalog deletion details.');
    }
    return parseImpact(data[0]);
  },

  async deleteCanonicalDocument(documentId) {
    const data = await invokeMaintenance({ action: 'delete', documentId });
    if (data.deleted !== true) throw new Error('The server did not confirm catalog deletion.');
    return {
      impact: parseImpact(data.impact),
      cleanup: parseCleanup(data.cleanup, data.error),
    };
  },

  async getPendingCleanupCount() {
    const data = await invokeMaintenance({ action: 'pending_cleanup' });
    if (!Number.isSafeInteger(data.pending) || Number(data.pending) < 0) {
      throw new Error('The server returned an invalid pending cleanup count.');
    }
    return Number(data.pending);
  },

  async retryPendingCleanup() {
    const data = await invokeMaintenance({ action: 'retry_cleanup' });
    return parseCleanup(data.cleanup, data.error);
  },
};

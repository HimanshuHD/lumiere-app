import { supabase } from '@/infrastructure/supabase/client';
import type { UserDocumentDeletionImpact, UserDocumentDeletionStore } from '@/services/userDocumentDeletion';

function parseImpact(row: Record<string, unknown>): UserDocumentDeletionImpact {
  const { title, bookmark_users, reading_users, reading_list_users } = row;
  if (
    typeof title !== 'string'
    || typeof bookmark_users !== 'number'
    || typeof reading_users !== 'number'
    || typeof reading_list_users !== 'number'
    || !Number.isFinite(bookmark_users)
    || !Number.isFinite(reading_users)
    || !Number.isFinite(reading_list_users)
    || bookmark_users < 0
    || reading_users < 0
    || reading_list_users < 0
  ) {
    throw new Error('The server returned invalid document deletion details.');
  }
  return {
    title,
    bookmarkUsers: bookmark_users,
    readingUsers: reading_users,
    readingListUsers: reading_list_users,
  };
}

export const supabaseUserDocumentDeletionStore: UserDocumentDeletionStore = {
  async getDeletionImpact(documentId) {
    const { data, error } = await supabase.rpc('get_user_upload_deletion_impact', {
      p_document_id: documentId,
    });
    if (error) throw new Error(`Could not load document deletion details: ${error.message}`);
    if (!Array.isArray(data) || data.length !== 1 || !data[0] || typeof data[0] !== 'object') {
      throw new Error('The server did not return document deletion details.');
    }
    return parseImpact(data[0] as Record<string, unknown>);
  },

  async deleteOwnedUpload(documentId) {
    const { data, error } = await supabase.rpc('delete_owned_user_upload', {
      p_document_id: documentId,
    });
    if (error) throw new Error(`Could not delete document: ${error.message}`);
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      throw new Error('The server did not confirm document deletion.');
    }
    const impact = parseImpact(data as Record<string, unknown>);
    return impact;
  },
};

import { mapSummary, mapDocument, mapReference } from './mappers';
import { supabase } from './client';
import { DOCUMENT_SUMMARY_FIELDS } from './document-fields';
import type { UserDataRepository, CollectionName } from '@/domain/collections';
import { ServiceError } from '@/domain/errors';

export function createUserDataRepository(userId: string): UserDataRepository {
  const remove = async (collection: CollectionName, id: string) => {
    const { data, error } = await supabase.from(collection).delete().eq('user_id', userId).eq('document_id', id).select('id');
    if (error) throw error; return data?.length ?? 0;
  };
  return {
    async listDocuments(signal) {
      const { data, error } = await supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS).order('created_at', { ascending: true }).abortSignal(signal);
      if (error) throw error; return (data ?? []).map(mapSummary);
    },
    async listCatalog(signal) {
      const { data, error } = await supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS).eq('origin', 'catalog_import').order('title', { ascending: true }).limit(1000).abortSignal(signal);
      if (error) throw error; return (data ?? []).map(mapSummary);
    },
    async listLocked(signal) {
      const { data, error } = await supabase.rpc('get_locked_document_summaries').abortSignal(signal);
      if (error) throw error; return (data ?? []).map(mapSummary);
    },
    async listMembershipIds(signal) {
      const { data, error } = await supabase.from('document_library_memberships').select('document_id').eq('user_id', userId).abortSignal(signal);
      if (error) throw error; return (data ?? []).map(row => row.document_id);
    },
    async listReferences(collection, signal) {
      const { data, error } = await supabase.from(collection).select(`id,user_id,document_id,created_at,document:documents(${DOCUMENT_SUMMARY_FIELDS})`)
        .eq('user_id', userId).order('created_at', { ascending: false }).abortSignal(signal);
      if (error) throw error; return (data ?? []).map(mapReference);
    },
    async getDocument(id, signal) {
      const { data, error } = await supabase.from('documents').select('*').eq('id', id).abortSignal(signal).maybeSingle();
      if (error) throw error;
      return data ? mapDocument(data) : null;
    },
    async getSummary(id) {
      const { data, error } = await supabase.from('documents').select(DOCUMENT_SUMMARY_FIELDS).eq('id', id).single();
      if (error) throw error; if (!data) throw new ServiceError('unexpected', 'The document metadata was not returned.');
      return mapSummary(data);
    },
    async saveReference(collection, id) {
      const { data, error } = await supabase.from(collection).upsert({ user_id: userId, document_id: id }, { onConflict: 'user_id,document_id' }).select('id,user_id,document_id,created_at').single();
      if (error) throw error; if (!data) throw new ServiceError('unexpected', 'The save was not confirmed.'); return mapReference(data);
    },
    deleteReferences: remove,
  };
}

import { mapProgress, mapSaveResult } from './mappers';
import { supabase } from './client';
import type { PendingSave, ProgressRow, SaveResult } from '@/domain/progress';
export const progressRepository = {
  async list(userId: string): Promise<ProgressRow[]> {
    const { data, error } = await supabase.from('reading_progress').select('*').eq('user_id', userId);
    if (error) throw error; return (data ?? []).map(mapProgress);
  },
  async save(userId: string, documentId: string, pending: PendingSave): Promise<SaveResult> {
    const { data, error } = await supabase.rpc('save_reading_position', {
      p_user_id: userId, p_document_id: documentId, p_position: pending.position,
      p_chapter_index: pending.chapterIndex, p_scroll_percent: pending.progress,
      p_expected_revision: pending.expectedRevision, p_mutation_id: pending.mutationId,
    });
    if (error) throw error; return mapSaveResult(data);
  },
};

import { supabase } from '@/lib/supabase';
import type { UserDocumentVisibilityStore } from '@/services/userDocumentVisibility';

export const supabaseUserDocumentVisibilityStore: UserDocumentVisibilityStore = {
  async updateOwnedDocument(userId, documentId, updates) {
    const { data, error } = await supabase
      .from('documents')
      .update(updates)
      .eq('id', documentId)
      .eq('uploaded_by', userId)
      .eq('origin', 'user_upload')
      .select('*')
      .single();
    if (error) throw new Error(`Could not update document: ${error.message}`);
    if (!data) throw new Error('The updated document was not returned.');
    return data;
  },
};

import { supabase } from '@/infrastructure/supabase/client';
import type { CatalogCollectionStore } from '@/services/catalogCollection';

export const supabaseCatalogCollectionStore: CatalogCollectionStore = {
  async addMembership(userId, documentId) {
    const { error } = await supabase
      .from('document_library_memberships')
      .upsert(
        { user_id: userId, document_id: documentId },
        { onConflict: 'user_id,document_id', ignoreDuplicates: true },
      );
    if (error) throw new Error(`Could not add catalog document to your collection: ${error.message}`);
  },
  async removeMembership(userId, documentId) {
    const { error } = await supabase
      .from('document_library_memberships')
      .delete()
      .eq('user_id', userId)
      .eq('document_id', documentId);
    if (error) throw new Error(`Could not remove catalog document from your collection: ${error.message}`);
  },
};

import { supabase } from '@/lib/supabase';
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
};

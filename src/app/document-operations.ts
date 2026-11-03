/** Composition layer: adapters persist; these commands notify feature state after success. */
import { cachedAccountStore, activeAccountStore } from './account-runtime';
import { supabaseCatalogCollectionStore as collection } from '@/infrastructure/supabase/catalog-collection';
import { supabaseUserDocumentVisibilityStore as visibility } from '@/infrastructure/supabase/user-document-visibility';
import { supabaseUserDocumentDeletionStore as deletion } from '@/infrastructure/supabase/user-document-deletion';
import { supabaseCatalogMaintenanceStore as maintenance } from '@/infrastructure/supabase/catalog-maintenance';
export { supabaseCatalogImportStore } from '@/infrastructure/supabase/catalog-import';
export { supabaseDocumentLifecycleDependencies } from '@/infrastructure/supabase/document-lifecycle';

export const supabaseCatalogCollectionStore: typeof collection = {
  async addMembership(userId, id) {
    const account = cachedAccountStore(userId); await collection.addMembership(userId, id); account?.membershipChanged(id, true);
  },
  async removeMembership(userId, id) {
    const account = cachedAccountStore(userId); await collection.removeMembership(userId, id); account?.membershipChanged(id, false);
  },
};
export const supabaseUserDocumentVisibilityStore: typeof visibility = {
  async updateOwnedDocument(userId, id, updates) {
    const account = cachedAccountStore(userId); const result = await visibility.updateOwnedDocument(userId, id, updates); account?.changedDocument(id); return result;
  },
};
export const supabaseUserDocumentDeletionStore: typeof deletion = {
  getDeletionImpact: deletion.getDeletionImpact,
  async deleteOwnedUpload(id) {
    const account = activeAccountStore(); const result = await deletion.deleteOwnedUpload(id); account?.changedDocument(id, true); return result;
  },
};
export const supabaseCatalogMaintenanceStore: typeof maintenance = {
  ...maintenance,
  async deleteCanonicalDocument(id) {
    const account = activeAccountStore(); const result = await maintenance.deleteCanonicalDocument(id); account?.changedDocument(id, true); return result;
  },
};

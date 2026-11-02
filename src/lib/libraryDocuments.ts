import type { Document } from './supabase';

/** Input is already constrained by database RLS, including redacted locked references. */
export function selectLibraryDocuments(documents: Document[], membershipIds: ReadonlySet<string>): Document[] {
  return documents.filter(document => {
    if (document.origin === 'demo') return document.visibility === 'shared';
    if (document.origin === 'catalog_import') return membershipIds.has(document.id);
    return true;
  });
}

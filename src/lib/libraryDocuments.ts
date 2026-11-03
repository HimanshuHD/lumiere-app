import type { Document } from '../domain/documents.ts';
type LibraryMetadata = Pick<Document, 'id' | 'origin' | 'visibility'>;

/** Input is already constrained by database RLS, including redacted locked references. */
export function selectLibraryDocuments<T extends LibraryMetadata>(documents: T[], membershipIds: ReadonlySet<string>): T[] {
  return documents.filter(document => {
    if (document.origin === 'demo') return document.visibility === 'shared';
    if (document.origin === 'catalog_import') return membershipIds.has(document.id);
    return true;
  });
}

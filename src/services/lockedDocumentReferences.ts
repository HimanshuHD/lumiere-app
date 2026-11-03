import type { Document } from '@/domain/documents';

// A denied embedded documents join is null. Hydrate it only with the server's
// redacted reference, and never replace a document the caller can already read.
export function attachLockedDocumentReferences<T extends {
  document_id: string;
  document?: Document | null;
}>(references: T[], lockedDocuments: Document[]): T[] {
  const byId = new Map(lockedDocuments.map((document) => [document.id, document]));
  return references.map((reference) => ({
    ...reference,
    document: reference.document ?? byId.get(reference.document_id),
  }));
}

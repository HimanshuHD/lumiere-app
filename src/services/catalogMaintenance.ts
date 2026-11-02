export interface CatalogDocumentDeletionImpact {
  title: string;
  bookmarkUsers: number;
  readingUsers: number;
  readingListUsers: number;
}

export interface CatalogCleanupResult {
  completed: number;
  pending: number;
  error?: string;
}

export interface CatalogMaintenanceResult {
  impact: CatalogDocumentDeletionImpact;
  cleanup: CatalogCleanupResult;
}

export interface CatalogMaintenanceStore {
  getDeletionImpact(documentId: string): Promise<CatalogDocumentDeletionImpact>;
  deleteCanonicalDocument(documentId: string): Promise<CatalogMaintenanceResult>;
  getPendingCleanupCount(): Promise<number>;
  retryPendingCleanup(): Promise<CatalogCleanupResult>;
}

export function getCatalogDocumentDeletionImpact(
  store: CatalogMaintenanceStore,
  documentId: string,
): Promise<CatalogDocumentDeletionImpact> {
  return store.getDeletionImpact(documentId);
}

export function deleteCanonicalCatalogDocument(
  store: CatalogMaintenanceStore,
  documentId: string,
): Promise<CatalogMaintenanceResult> {
  return store.deleteCanonicalDocument(documentId);
}

export function getCatalogCleanupCount(store: CatalogMaintenanceStore): Promise<number> {
  return store.getPendingCleanupCount();
}

export function retryCatalogCleanup(store: CatalogMaintenanceStore): Promise<CatalogCleanupResult> {
  return store.retryPendingCleanup();
}

import { Modal } from '@/shared/ui';
import { useCatalogDocuments } from '@/hooks/useData';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, ArrowLeft, Loader2, Search, Shield, Trash2 } from 'lucide-react';
import type {  DocumentSummary as Document  } from '@/domain/document-summary';
import { DocumentCover } from '@/components/DocumentCover';
import { useToast } from '@/shared/ui';
import {
  deleteCanonicalCatalogDocument,
  getCatalogCleanupCount,
  getCatalogDocumentDeletionImpact,
  retryCatalogCleanup,
  type CatalogCleanupResult,
  type CatalogDocumentDeletionImpact,
} from '@/services/catalogMaintenance';
import { supabaseCatalogMaintenanceStore } from '@/app/document-operations';

interface CatalogAdminProps {
  onBack: () => void;
}

function cleanupMessage(cleanup: CatalogCleanupResult): string {
  return cleanup.error
    ?? `${cleanup.pending} catalog storage object(s) remain queued for cleanup.`;
}

export function CatalogAdmin({ onBack }: CatalogAdminProps) {
  const { showToast } = useToast();
  const { data: documents, loading: catalogLoading, error: catalogError, refetch: refreshCatalog } = useCatalogDocuments();
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selectedDocument, setSelectedDocument] = useState<Document | null>(null);
  const [impact, setImpact] = useState<CatalogDocumentDeletionImpact | null>(null);
  const [impactError, setImpactError] = useState<string | null>(null);
  const [loadingImpact, setLoadingImpact] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pendingCleanup, setPendingCleanup] = useState(0);
  const [retryingCleanup, setRetryingCleanup] = useState(false);

  const loadCatalog = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [, pendingCount] = await Promise.all([
        refreshCatalog(), getCatalogCleanupCount(supabaseCatalogMaintenanceStore),
      ]);
      setPendingCleanup(pendingCount);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not load catalog maintenance data.');
    } finally {
      setLoading(false);
    }
  }, [refreshCatalog]);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const filteredDocuments = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return documents;
    return documents.filter((document) =>
      document.title.toLowerCase().includes(query)
      || document.author.toLowerCase().includes(query)
      || document.source_url?.toLowerCase().includes(query)
      || document.source_identity?.toLowerCase().includes(query)
    );
  }, [documents, search]);

  const prepareDelete = async (document: Document) => {
    setSelectedDocument(document);
    setImpact(null);
    setImpactError(null);
    setLoadingImpact(true);
    try {
      setImpact(await getCatalogDocumentDeletionImpact(supabaseCatalogMaintenanceStore, document.id));
    } catch (error) {
      setImpactError(error instanceof Error ? error.message : 'Could not load deletion details.');
    } finally {
      setLoadingImpact(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedDocument || !impact || deleting) return;
    setDeleting(true);
    try {
      const result = await deleteCanonicalCatalogDocument(
        supabaseCatalogMaintenanceStore,
        selectedDocument.id,
      );

      setSelectedDocument(null);
      setImpact(null);
      setPendingCleanup(result.cleanup.pending);
      if (result.cleanup.pending > 0) {
        showToast(`Catalog record and user references were deleted. ${cleanupMessage(result.cleanup)}`, 'error');
      } else {
        showToast('Catalog record, user references, and storage files were deleted.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not delete the catalog document.', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleRetryCleanup = async () => {
    if (retryingCleanup) return;
    setRetryingCleanup(true);
    try {
      const result = await retryCatalogCleanup(supabaseCatalogMaintenanceStore);
      setPendingCleanup(result.pending);
      if (result.pending > 0) {
        showToast(`Some catalog storage objects are still pending. ${cleanupMessage(result)}`, 'error');
      } else {
        showToast('Pending catalog storage cleanup completed.');
      }
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Could not retry catalog storage cleanup.', 'error');
    } finally {
      setRetryingCleanup(false);
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <button
          onClick={onBack}
          aria-label="Back to library"
          className="p-2 rounded-lg text-stone-600 hover:text-stone-800 hover:bg-stone-100"
        >
          <ArrowLeft aria-hidden="true" className="w-5 h-5" />
        </button>
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <Shield aria-hidden="true" className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Catalog maintenance</h1>
          <p className="text-sm text-stone-600">Permanently remove canonical catalog documents from Lumiere.</p>
        </div>
      </div>

      <div className="mb-5 rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-900">
        Global deletion removes a shared catalog record and all users&apos; bookmarks, reading progress,
        Read Later entries, and collection memberships. This cannot be undone.
      </div>

      {pendingCleanup > 0 && (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <p className="text-sm text-amber-900">
            {pendingCleanup} catalog storage object(s) still need cleanup.
          </p>
          <button
            onClick={() => void handleRetryCleanup()}
            disabled={retryingCleanup}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-700 px-3 py-2 text-sm font-medium text-white hover:bg-amber-800 disabled:opacity-50"
          >
            {retryingCleanup && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
            Retry cleanup
          </button>
        </div>
      )}

      <div className="relative mb-5 max-w-lg">
        <Search aria-hidden="true" className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-600" />
        <input
          aria-label="Search catalog documents" value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search title, author, or source..."
          className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-4 text-sm text-stone-800 focus:border-amber-600 focus:outline-none focus:ring-2 focus:ring-amber-600/20"
        />
      </div>

      {(loading || catalogLoading) ? (
        <div className="flex min-h-48 items-center justify-center">
          <Loader2 aria-hidden="true" className="h-8 w-8 animate-spin text-amber-700" />
        </div>
      ) : (loadError || catalogError) ? (
        <div className="rounded-xl border border-red-200 bg-red-50 p-5 text-sm text-red-800">
          <p>Could not load catalog maintenance data: {loadError || catalogError}</p>
          <button onClick={() => void loadCatalog()} className="mt-3 font-semibold underline">Try again</button>
        </div>
      ) : filteredDocuments.length === 0 ? (
        <div className="rounded-xl border border-stone-200 bg-white p-10 text-center text-sm text-stone-600">
          {documents.length === 0 ? 'There are no canonical catalog documents.' : 'No documents match your search.'}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-600">Document</th>
                <th className="px-4 py-3 text-left text-xs font-medium uppercase tracking-wider text-stone-600">Source identity</th>
                <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-stone-600">Action</th>
              </tr>
            </thead>
            <tbody>
              {filteredDocuments.map((document) => (
                <tr key={document.id} className="border-b border-stone-100 last:border-0">
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <DocumentCover document={document} className="h-11 w-8 flex-shrink-0 rounded object-cover" />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-stone-800">{document.title}</p>
                        <p className="truncate text-xs text-stone-600">{document.author}</p>
                      </div>
                    </div>
                  </td>
                  <td className="max-w-sm truncate px-4 py-3 text-xs text-stone-600">
                    {document.source_identity || document.source_url || 'No source identity'}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => void prepareDelete(document)}
                      className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-xs font-medium text-red-700 hover:bg-red-50"
                    >
                      <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
                      Global delete
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedDocument && (
        <Modal onClose={() => { if (!deleting) { setSelectedDocument(null); setImpact(null); } }} label="Delete canonical document" className="theme-scope fixed inset-0 z-[70] flex items-center justify-center bg-black/50 p-4">
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-2xl"
          >
            <div className="mb-4 flex items-start gap-3">
              <div className="rounded-xl bg-red-100 p-2.5">
                <AlertTriangle aria-hidden="true" className="h-5 w-5 text-red-700" />
              </div>
              <div>
                <h2 id="catalog-delete-title" className="text-lg font-semibold text-stone-900">
                  Permanently delete canonical document?
                </h2>
                <p className="mt-1 text-sm text-stone-600">{selectedDocument.title}</p>
              </div>
            </div>

            {loadingImpact ? (
              <div className="flex items-center gap-2 py-4 text-sm text-stone-600">
                <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                Loading affected-user counts...
              </div>
            ) : impactError ? (
              <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">{impactError}</p>
            ) : impact ? (
              <>
                <p className="text-sm text-stone-700">
                  This permanently deletes the canonical catalog record and removes its file and cover.
                  Other users&apos; saved references will also be deleted:
                </p>
                <ul className="my-4 space-y-1.5 rounded-lg bg-stone-50 p-4 text-sm text-stone-700">
                  <li>{impact.bookmarkUsers} user(s) with bookmarks</li>
                  <li>{impact.readingUsers} user(s) with reading progress</li>
                  <li>{impact.readingListUsers} user(s) with Read Later entries</li>
                </ul>
                <p className="text-sm font-semibold text-red-700">This action is irreversible.</p>
              </>
            ) : null}

            <div className="mt-6 flex justify-end gap-3">
              <button
                onClick={() => { setSelectedDocument(null); setImpact(null); }}
                disabled={deleting}
                className="rounded-lg border border-stone-200 px-4 py-2 text-sm font-medium text-stone-700 hover:bg-stone-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleDelete()}
                disabled={!impact || loadingImpact || Boolean(impactError) || deleting}
                className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-2 text-sm font-medium text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {deleting && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                Permanently delete
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}

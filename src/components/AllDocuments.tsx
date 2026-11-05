import { DemoBadge } from '@/components/DemoBadge';
import { useState, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, User, Hash, Search, BookMinus } from 'lucide-react';
import type {  DocumentSummary as Document  } from '@/domain/document-summary';
import { ReadLaterButton } from '@/components/ReadLaterButton';
import { useReadingProgress } from '@/hooks/useData';
import { DocumentCover } from '@/components/DocumentCover';
import { useAuth } from '@/features/auth';
import { useToast } from '@/shared/ui';
import { removeCatalogDocumentFromCollection } from '@/services/catalogCollection';
import { supabaseCatalogCollectionStore } from '@/app/document-operations';
import { DocumentAccessNotice } from '@/components/DocumentAccessNotice';
import { isDocumentLockedForUser } from '@/lib/documentAccess';

interface AllDocumentsProps {
  documents: Document[];
  loading: boolean;
  onOpenDoc: (doc: Document) => void;
  onBack: () => void;
  onCollectionChanged: () => Promise<void>;
}

const PAGE_SIZE = 10;

export function AllDocuments({
  documents,
  loading,
  onOpenDoc,
  onBack,
  onCollectionChanged,
}: AllDocumentsProps) {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const [removingDocumentId, setRemovingDocumentId] = useState<string | null>(null);
  const { getProgress } = useReadingProgress();

  const handleRemoveFromCollection = async (document: Document) => {
    if (!user || removingDocumentId) return;
    setRemovingDocumentId(document.id);
    try {
      await removeCatalogDocumentFromCollection(
        supabaseCatalogCollectionStore,
        user.id,
        document,
      );
      await onCollectionChanged();
      showToast('Removed from your collection. The shared catalog book remains available to others.');
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : 'Could not remove the book from your collection.',
        'error',
      );
    } finally {
      setRemovingDocumentId(null);
    }
  };

  const sorted = useMemo(() => {
    return [...documents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  }, [documents]);

  const filtered = useMemo(() => {
    if (!search) return sorted;
    return sorted.filter((doc) =>
      doc.title.toLowerCase().includes(search.toLowerCase()) ||
      doc.author.toLowerCase().includes(search.toLowerCase())
    );
  }, [sorted, search]);

  const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
  const currentPage = Math.min(page, Math.max(0, totalPages - 1));
  const pageDocs = filtered.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const goToPage = (p: number) => {
    if (p < 0 || p >= totalPages) return;
    setPage(p);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={onBack}
          aria-label="Back to library"
          className="p-2 rounded-lg text-stone-600 hover:text-stone-800 hover:bg-stone-100 transition-colors"
        >
          <ArrowLeft aria-hidden="true" className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">All Documents</h1>
          <p className="text-sm text-stone-600">{filtered.length} documents · sorted by most recent</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-600" />
          <input
            type="text"
            aria-label="Search documents" value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by title or author..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-800 placeholder-stone-600 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      {pageDocs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider w-[35%]">Document</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider hidden sm:table-cell">Author</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider hidden md:table-cell">Uploaded By</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider hidden lg:table-cell">Upload Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-600 uppercase tracking-wider hidden sm:table-cell">Read Time</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {pageDocs.map((doc) => {
                const uploadDate = new Date(doc.created_at);
                const timeLabel = uploadDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                const locked = isDocumentLockedForUser(doc, user?.id);
                return (
                  <tr
                    key={doc.id}
                    onClick={() => !locked && onOpenDoc(doc)}
                    aria-disabled={locked}
                    className={`border-b border-stone-100 last:border-0 transition-colors group ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-amber-50/40'}`}
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        <DocumentCover document={doc} className="w-8 h-11 object-cover rounded flex-shrink-0" />
                        <div className="min-w-0 overflow-hidden">
                          <p className="text-sm font-medium text-stone-800 truncate group-hover:text-amber-700 transition-colors"><button type="button" className="text-left rounded" disabled={isDocumentLockedForUser(doc, user?.id)} aria-label={`Open ${doc.title}`} onClick={(event) => { event.stopPropagation(); onOpenDoc(doc); }}>{doc.title}</button></p>
                          <DemoBadge document={doc} />
                          {locked && <div className="mt-1 max-w-xs"><DocumentAccessNotice /></div>}
                          <p className="text-xs text-stone-600 sm:hidden truncate">{doc.author}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-600 rounded font-medium">{doc.category}</span>
                            {doc.page_count && (
                              <span className="text-[10px] text-stone-600 flex items-center gap-0.5">
                                <Hash aria-hidden="true" className="w-2.5 h-2.5" />
                                {doc.page_count}p
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 hidden sm:table-cell">{doc.author}</td>
                    <td className="px-4 py-3 text-sm text-stone-600 hidden md:table-cell">
                      {doc.uploaded_by ? (
                        <span className="inline-flex items-center gap-1 text-stone-600">
                          <User aria-hidden="true" className="w-3 h-3 text-stone-600" />
                          Member
                        </span>
                      ) : (
                        <span className="text-stone-600 text-xs">{doc.origin === 'demo' ? 'Demo' : 'Curated'}</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-600 hidden lg:table-cell">{timeLabel}</td>
                    <td className="px-4 py-3 text-sm text-stone-600 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <Clock aria-hidden="true" className="w-3 h-3" />
                        {doc.reading_time}m
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!locked && <ReadLaterButton doc={doc} variant="compact" hasProgress={!!getProgress(doc.id)} />}
                        {doc.origin === 'catalog_import' && (
                          <button
                            type="button"
                            aria-label={`Remove ${doc.title} from my collection`}
                            title="Remove from my collection"
                            disabled={removingDocumentId !== null}
                            onClick={(event) => {
                              event.stopPropagation();
                              void handleRemoveFromCollection(doc);
                            }}
                            className="p-1.5 rounded-md text-stone-600 hover:text-red-600 hover:bg-red-50 disabled:opacity-40 transition-colors"
                          >
                            {removingDocumentId === doc.id ? (
                              <span className="block w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <BookMinus aria-hidden="true" className="w-4 h-4" />
                            )}
                          </button>
                        )}
                        {!locked && (
                          <span className="text-xs text-amber-700 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                            Read
                          </span>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="text-center py-20">
          <p className="text-stone-600 text-sm">No documents found matching your search.</p>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-6">
          <button
            onClick={() => goToPage(currentPage - 1)}
            disabled={currentPage === 0}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            <ChevronLeft aria-hidden="true" className="w-4 h-4" />
            Previous
          </button>
          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => (
              <button
                key={i}
                onClick={() => goToPage(i)}
                className={`w-9 h-9 rounded-lg text-sm font-medium transition-all ${
                  i === currentPage
                    ? 'bg-stone-900 text-white'
                    : 'text-stone-600 bg-white border border-stone-200 hover:bg-stone-50'
                }`}
              >
                {i + 1}
              </button>
            ))}
          </div>
          <button
            onClick={() => goToPage(currentPage + 1)}
            disabled={currentPage >= totalPages - 1}
            className="inline-flex items-center gap-1.5 px-3 py-2 text-sm font-medium text-stone-600 bg-white border border-stone-200 rounded-lg hover:bg-stone-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
          >
            Next
            <ChevronRight aria-hidden="true" className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

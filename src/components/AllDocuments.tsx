import { useState, useMemo } from 'react';
import { ArrowLeft, ChevronLeft, ChevronRight, Clock, User, Hash, Search } from 'lucide-react';
import { Document } from '@/lib/supabase';
import { ReadLaterButton } from '@/components/ReadLaterButton';
import { useReadingProgress } from '@/hooks/useData';

interface AllDocumentsProps {
  documents: Document[];
  loading: boolean;
  onOpenDoc: (doc: Document) => void;
  onBack: () => void;
}

const PAGE_SIZE = 10;

export function AllDocuments({ documents, loading, onOpenDoc, onBack }: AllDocumentsProps) {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState('');
  const { getProgress } = useReadingProgress();

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
          className="p-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
        >
          <ArrowLeft className="w-5 h-5" />
        </button>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">All Documents</h1>
          <p className="text-sm text-stone-500">{filtered.length} documents · sorted by most recent</p>
        </div>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative max-w-md">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by title or author..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
          />
        </div>
      </div>

      {/* Table */}
      {pageDocs.length > 0 ? (
        <div className="overflow-x-auto rounded-xl border border-stone-200 bg-white">
          <table className="w-full min-w-[700px]">
            <thead>
              <tr className="border-b border-stone-200 bg-stone-50">
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider w-[35%]">Document</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden sm:table-cell">Author</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden md:table-cell">Uploaded By</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden lg:table-cell">Upload Time</th>
                <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden sm:table-cell">Read Time</th>
                <th className="px-4 py-3 w-20"></th>
              </tr>
            </thead>
            <tbody>
              {pageDocs.map((doc) => {
                const uploadDate = new Date(doc.created_at);
                const timeLabel = uploadDate.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
                return (
                  <tr
                    key={doc.id}
                    onClick={() => onOpenDoc(doc)}
                    className="border-b border-stone-100 last:border-0 hover:bg-amber-50/40 transition-colors cursor-pointer group"
                  >
                    <td className="px-4 py-3 max-w-xs">
                      <div className="flex items-center gap-3">
                        <img src={doc.cover_url} alt="" className="w-8 h-11 object-cover rounded flex-shrink-0" />
                        <div className="min-w-0 overflow-hidden">
                          <p className="text-sm font-medium text-stone-800 truncate group-hover:text-amber-700 transition-colors">{doc.title}</p>
                          <p className="text-xs text-stone-400 sm:hidden truncate">{doc.author}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded font-medium">{doc.category}</span>
                            {doc.page_count && (
                              <span className="text-[10px] text-stone-400 flex items-center gap-0.5">
                                <Hash className="w-2.5 h-2.5" />
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
                          <User className="w-3 h-3 text-stone-400" />
                          Member
                        </span>
                      ) : (
                        <span className="text-stone-400 text-xs">Curated</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm text-stone-500 hidden lg:table-cell">{timeLabel}</td>
                    <td className="px-4 py-3 text-sm text-stone-500 hidden sm:table-cell">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {doc.reading_time}m
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <ReadLaterButton doc={doc} variant="compact" hasProgress={!!getProgress(doc.id)} />
                        <span className="text-xs text-amber-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Read
                        </span>
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
          <p className="text-stone-400 text-sm">No documents found matching your search.</p>
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
            <ChevronLeft className="w-4 h-4" />
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
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

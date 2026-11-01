import { useState, useMemo } from 'react';
import { Search, Clock, BookMarked, Play, Star, Sparkles, User, FileText, Hash, X, Download, ChevronRight } from 'lucide-react';
import { Document, ReadingProgress } from '@/lib/supabase';
import { useBookmarks, useReadingProgress } from '@/hooks/useData';
import { ReadLaterButton } from '@/components/ReadLaterButton';
import { DocumentCover } from '@/components/DocumentCover';
import { DocumentFileLink } from '@/components/DocumentFileLink';

interface LibraryProps {
  documents: Document[];
  loading: boolean;
  onOpenDoc: (doc: Document) => void;
  onViewAll: () => void;
}

const categories = ['All', 'Fiction', 'Non-Fiction', 'Science', 'History', 'Technology', 'Philosophy', 'Adventure'];

function getProgressPercent(doc: Document, progress?: ReadingProgress): number {
  if (!progress) return 0;
  const chapterCount = Math.max(1, doc.chapters.length);
  return Math.min(100, Math.max(0, Math.round(
    ((progress.chapter_index + progress.scroll_percent) / chapterCount) * 100
  )));
}

export function Library({ documents, loading, onOpenDoc, onViewAll }: LibraryProps) {
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState('All');
  const [selectedDoc, setSelectedDoc] = useState<Document | null>(null);
  const { isBookmarked } = useBookmarks();
  const { progress, loading: progressLoading, getProgress } = useReadingProgress();

  const filtered = useMemo(() => {
    return documents.filter((doc) => {
      const matchesSearch =
        doc.title.toLowerCase().includes(search.toLowerCase()) ||
        doc.author.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = activeCategory === 'All' || doc.category === activeCategory;
      return matchesSearch && matchesCategory;
    });
  }, [documents, search, activeCategory]);

  const featured = useMemo(() => documents.find((d) => d.is_featured), [documents]);

  const recentAdditions = useMemo(() => {
    return [...documents]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 5);
  }, [documents]);

  const continueReading = useMemo(() => {
    return progress
      .map((readingProgress) => {
        const doc = documents.find((item) => item.id === readingProgress.document_id);
        return doc ? { doc, progress: readingProgress } : null;
      })
      .filter((item): item is { doc: Document; progress: ReadingProgress } =>
        item !== null && getProgressPercent(item.doc, item.progress) < 100
      )
      .sort((a, b) =>
        new Date(b.progress.updated_at).getTime() - new Date(a.progress.updated_at).getTime()
      )
      .slice(0, 3);
  }, [documents, progress]);

  const selectedProgress = selectedDoc ? getProgress(selectedDoc.id) : undefined;
  const selectedProgressPercent = selectedDoc
    ? getProgressPercent(selectedDoc, selectedProgress)
    : 0;

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Hero / Featured */}
      {featured && (
        <div
          className="relative rounded-3xl overflow-hidden mb-10 group cursor-pointer"
          onClick={() => onOpenDoc(featured)}
        >
          <div className="absolute inset-0">
            <DocumentCover document={featured} className="w-full h-full object-cover" />
            <div className="absolute inset-0 bg-gradient-to-t from-stone-900 via-stone-900/80 to-stone-900/30" />
          </div>
          <div className="relative p-8 sm:p-12 lg:p-16 min-h-[320px] sm:min-h-[380px] flex flex-col justify-end">
            <div className="flex items-center gap-2 mb-3">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              <span className="text-amber-400 text-xs font-medium uppercase tracking-widest">Featured Read</span>
            </div>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-serif font-bold text-white tracking-tight mb-3 max-w-2xl">
              {featured.title}
            </h1>
            <p className="text-stone-300 text-sm sm:text-base max-w-xl mb-4 leading-relaxed">
              {featured.summary}
            </p>
            <div className="flex items-center gap-4 text-stone-400 text-sm">
              <span className="font-medium text-stone-200">{featured.author}</span>
              <span className="flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" />
                {featured.reading_time} min read
              </span>
              <span className="px-2.5 py-0.5 bg-white/10 rounded-full text-xs">{featured.category}</span>
            </div>
            <button className="mt-6 inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all w-fit shadow-lg shadow-amber-600/20">
              <Play className="w-4 h-4" />
              Start Reading
            </button>
          </div>
        </div>
      )}

      {/* Continue Reading */}
      <div className="mb-10">
        <h2 className="text-lg font-serif font-bold text-stone-800 mb-4">Continue Reading</h2>
        {progressLoading ? (
          <p className="text-sm text-stone-500">Loading your reading progress...</p>
        ) : continueReading.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {continueReading.map(({ doc, progress }) => {
              const totalPercent = getProgressPercent(doc, progress);
              return (
                <div
                  key={doc.id}
                  onClick={() => onOpenDoc(doc)}
                  className="flex gap-4 p-4 bg-white rounded-xl border border-stone-200 hover:border-amber-400 hover:shadow-lg transition-all cursor-pointer group"
                >
                  <DocumentCover document={doc} className="w-16 h-24 object-cover rounded-md flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-serif font-semibold text-stone-800 text-sm truncate group-hover:text-amber-700 transition-colors">
                      {doc.title}
                    </h3>
                    <p className="text-xs text-stone-500 mb-2">{doc.author}</p>
                    <div className="w-full h-1.5 bg-stone-200 rounded-full overflow-hidden">
                      <div className="h-full bg-amber-600 rounded-full transition-all" style={{ width: `${totalPercent}%` }} />
                    </div>
                    <p className="text-xs text-stone-500 mt-1.5">{totalPercent}% complete</p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="text-sm text-stone-500">Books you start reading will appear here with your progress.</p>
        )}
      </div>

      {/* Recent Additions */}
      {recentAdditions.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-amber-600" />
              <h2 className="text-lg font-serif font-bold text-stone-800">Recent Additions</h2>
            </div>
            <button
              onClick={onViewAll}
              className="inline-flex items-center gap-1 text-xs font-medium text-amber-600 hover:text-amber-700 transition-colors"
            >
              View All
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="overflow-hidden rounded-xl border border-stone-200 bg-white">
            <table className="w-full">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider">Document</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden sm:table-cell">Author</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden md:table-cell">Uploaded By</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden lg:table-cell">Upload Time</th>
                  <th className="text-left px-4 py-3 text-xs font-medium text-stone-500 uppercase tracking-wider hidden sm:table-cell">Read Time</th>
                  <th className="px-4 py-3"></th>
                </tr>
              </thead>
              <tbody>
                {recentAdditions.map((doc) => {
                  const uploadDate = new Date(doc.created_at);
                  const isToday = uploadDate.toDateString() === new Date().toDateString();
                  const timeLabel = isToday
                    ? uploadDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    : uploadDate.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  return (
                    <tr
                      key={doc.id}
                      onClick={() => setSelectedDoc(doc)}
                      className="border-b border-stone-100 last:border-0 hover:bg-amber-50/40 transition-colors cursor-pointer group"
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-3">
                          <DocumentCover document={doc} className="w-8 h-11 object-cover rounded flex-shrink-0" />
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-stone-800 truncate group-hover:text-amber-700 transition-colors">{doc.title}</p>
                            <p className="text-xs text-stone-400 sm:hidden">{doc.author}</p>
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
                        <button className="text-xs text-amber-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                          Details
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={() => setSelectedDoc(null)}>
          <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
          <div
            className="relative bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedDoc(null)}
              className="absolute top-4 right-4 w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors z-10"
            >
              <X className="w-4 h-4 text-stone-500" />
            </button>
            <div className="flex flex-col sm:flex-row gap-6 p-6">
              <DocumentCover document={selectedDoc} className="w-32 h-44 object-cover rounded-lg shadow-md flex-shrink-0 mx-auto sm:mx-0" />
              <div className="flex-1 min-w-0">
                <h3 className="text-xl font-serif font-bold text-stone-800 mb-1">{selectedDoc.title}</h3>
                <p className="text-sm text-stone-500 mb-3">by {selectedDoc.author}</p>
                <p className="text-sm text-stone-600 leading-relaxed mb-4">{selectedDoc.summary}</p>
                <div className="grid grid-cols-2 gap-3 mb-4">
                  <div className="p-2.5 bg-stone-50 rounded-lg">
                    <p className="text-xs text-stone-400 mb-0.5">Category</p>
                    <p className="text-sm font-medium text-stone-700">{selectedDoc.category}</p>
                  </div>
                  <div className="p-2.5 bg-stone-50 rounded-lg">
                    <p className="text-xs text-stone-400 mb-0.5">Read Time</p>
                    <p className="text-sm font-medium text-stone-700 flex items-center gap-1">
                      <Clock className="w-3 h-3" /> {selectedDoc.reading_time} min
                    </p>
                  </div>
                  {selectedDoc.page_count && (
                    <div className="p-2.5 bg-stone-50 rounded-lg">
                      <p className="text-xs text-stone-400 mb-0.5">Pages</p>
                      <p className="text-sm font-medium text-stone-700 flex items-center gap-1">
                        <Hash className="w-3 h-3" /> {selectedDoc.page_count}
                      </p>
                    </div>
                  )}
                  <div className="p-2.5 bg-stone-50 rounded-lg">
                    <p className="text-xs text-stone-400 mb-0.5">Chapters</p>
                    <p className="text-sm font-medium text-stone-700 flex items-center gap-1">
                      <FileText className="w-3 h-3" /> {selectedDoc.chapters.length}
                    </p>
                  </div>
                </div>
                <div className="p-2.5 bg-stone-50 rounded-lg mb-4">
                  <p className="text-xs text-stone-400 mb-0.5">Uploaded</p>
                  <p className="text-sm font-medium text-stone-700">
                    {selectedDoc.uploaded_by ? 'Community member' : 'Curated content'} · {new Date(selectedDoc.created_at).toLocaleDateString([], { year: 'numeric', month: 'long', day: 'numeric' })}
                  </p>
                </div>
                <div className="flex items-center gap-3 flex-wrap">
                  {(selectedDoc.file_storage_path || selectedDoc.file_url) && (
                    <DocumentFileLink
                      document={selectedDoc}
                      download={selectedDoc.file_name || undefined}
                      className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-all"
                    >
                      <Download className="w-4 h-4 text-stone-500" />
                      Download original {(selectedDoc.file_format || 'file').toUpperCase()}
                    </DocumentFileLink>
                  )}
                  {!selectedProgress && <ReadLaterButton doc={selectedDoc} />}
                  <button
                    onClick={() => { onOpenDoc(selectedDoc); setSelectedDoc(null); }}
                    className="inline-flex items-center gap-2 px-5 py-2.5 bg-amber-600 hover:bg-amber-500 text-white text-sm font-medium rounded-lg transition-all shadow-lg shadow-amber-600/20"
                  >
                    <Play className="w-4 h-4" />
                    {!selectedProgress
                      ? 'Start Reading'
                      : selectedDoc.page_count == null
                        ? 'Continue Reading'
                        : `Continue Reading (${Math.ceil(selectedDoc.page_count * (1 - selectedProgressPercent / 100))} pages remaining)`}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Search and Filters */}
      <div className="mb-6 space-y-4">
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by title or author..."
            className="w-full pl-11 pr-4 py-3 bg-white border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {categories.map((cat) => (
            <button
              key={cat}
              onClick={() => setActiveCategory(cat)}
              className={`px-3.5 py-1.5 text-xs font-medium rounded-full transition-all ${
                activeCategory === cat
                  ? 'bg-stone-900 text-white'
                  : 'bg-white text-stone-600 border border-stone-200 hover:border-stone-300 hover:bg-stone-50'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {/* Document Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
        {filtered.map((doc) => {
          const bookmarked = isBookmarked(doc.id);
          const prog = getProgress(doc.id);
          const totalPercent = getProgressPercent(doc, prog);
          return (
            <div
              key={doc.id}
              onClick={() => onOpenDoc(doc)}
              className="group cursor-pointer"
            >
              <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all">
                <DocumentCover
                  document={doc}
                  className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
                {bookmarked && (
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                    <BookMarked className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                )}
                {totalPercent > 0 && (
                  <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                    <div className="h-full bg-amber-500" style={{ width: `${totalPercent}%` }} />
                  </div>
                )}
                <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/95 text-stone-900 text-xs font-medium rounded-lg shadow-lg">
                    <Play className="w-3 h-3" />
                    {totalPercent > 0 ? 'Continue' : 'Read Now'}
                  </span>
                </div>
              </div>
              <h3 className="font-serif font-semibold text-stone-800 text-sm leading-snug line-clamp-2 group-hover:text-amber-700 transition-colors">
                {doc.title}
              </h3>
              <p className="text-xs text-stone-500 mt-0.5">{doc.author}</p>
              <div className="flex items-center gap-2 mt-1.5">
                <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded font-medium">
                  {doc.category}
                </span>
                <span className="flex items-center gap-0.5 text-[10px] text-stone-400">
                  <Clock className="w-2.5 h-2.5" />
                  {doc.reading_time}m
                </span>
              </div>
            </div>
          );
        })}
      </div>

      {filtered.length === 0 && (
        <div className="text-center py-20">
          <p className="text-stone-400 text-sm">No documents found matching your search.</p>
        </div>
      )}
    </div>
  );
}

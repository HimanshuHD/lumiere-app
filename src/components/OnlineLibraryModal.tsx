import { useState, useCallback } from 'react';
import { X, Globe, ExternalLink, BookOpen, Search, ArrowLeft, Loader2, Download, AlertCircle, BookMarked } from 'lucide-react';

interface OnlineLibraryModalProps {
  open: boolean;
  onClose: () => void;
}

interface OpdsCatalog {
  name: string;
  url: string;
  website: string;
  description: string;
  count: string;
  accent: string;
}

interface OpdsBook {
  title: string;
  author: string;
  summary: string;
  id: string;
  updated: string;
  coverUrl: string;
  downloadUrl: string;
  downloadType: string;
  categories: string[];
}

interface OpdsFeedResult {
  title: string;
  subtitle: string;
  count: number;
  books: OpdsBook[];
}

const OPDS_CATALOGS: OpdsCatalog[] = [
  {
    name: 'Project Gutenberg',
    url: 'https://m.gutenberg.org/ebooks.opds/',
    website: 'https://www.gutenberg.org/',
    description: 'Over 70,000 free public domain ebooks. The original and largest source of free ebooks, with classics from Austen, Dickens, Shakespeare, and more.',
    count: '70,000+ titles',
    accent: 'from-amber-500 to-amber-600',
  },
  {
    name: 'Standard Ebooks',
    url: 'https://standardebooks.org/feeds/opds',
    website: 'https://standardebooks.org/',
    description: 'Beautifully formatted, carefully proofread public domain books. Each ebook is crafted with attention to typography and readability.',
    count: '1,000+ titles',
    accent: 'from-stone-600 to-stone-700',
  },
  {
    name: 'Feedbooks',
    url: 'https://catalog.feedbooks.com/catalog/index.atom',
    website: 'https://www.feedbooks.com/',
    description: 'A mix of public domain classics and original contemporary works. Offers both free and paid titles across multiple genres.',
    count: '50,000+ titles',
    accent: 'from-blue-500 to-blue-600',
  },
  {
    name: 'ManyBooks',
    url: 'https://manybooks.net/opds/index.php',
    website: 'https://manybooks.net/',
    description: 'Over 50,000 free titles spanning fiction, non-fiction, and self-published works. Offers multiple download formats.',
    count: '50,000+ titles',
    accent: 'from-green-500 to-green-600',
  },
  {
    name: 'Internet Archive',
    url: 'https://bookserver.archive.org/catalog/',
    website: 'https://archive.org/',
    description: 'A massive digital library with millions of books, including historical texts, academic works, and out-of-print titles.',
    count: 'Millions of titles',
    accent: 'from-red-500 to-red-600',
  },
  {
    name: 'OAPEN',
    url: 'https://library.oapen.org/opds',
    website: 'https://www.oapen.org/',
    description: 'Open Access Publishing in European Networks. A collection of freely available academic books and research publications.',
    count: '20,000+ titles',
    accent: 'from-teal-500 to-teal-600',
  },
];

export function OnlineLibraryModal({ open, onClose }: OnlineLibraryModalProps) {
  const [query, setQuery] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<OpdsCatalog | null>(null);
  const [books, setBooks] = useState<OpdsBook[]>([]);
  const [feedTitle, setFeedTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleShowCatalog = useCallback(async (catalog: OpdsCatalog) => {
    setSelectedCatalog(catalog);
    setBooks([]);
    setError(null);
    setLoading(true);
    try {
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
      const endpoint = `${supabaseUrl}/functions/v1/opds-fetch?url=${encodeURIComponent(catalog.url)}`;
      const res = await fetch(endpoint, {
        headers: {
          Authorization: `Bearer ${anonKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({}));
        throw new Error(errBody.error || `Failed to load catalog (${res.status})`);
      }
      const data: OpdsFeedResult = await res.json();
      setFeedTitle(data.title || catalog.name);
      setBooks(data.books);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load catalog books');
    } finally {
      setLoading(false);
    }
  }, []);

  const handleBack = useCallback(() => {
    setSelectedCatalog(null);
    setBooks([]);
    setFeedTitle('');
    setError(null);
  }, []);

  const handleClose = useCallback(() => {
    onClose();
    handleBack();
    setQuery('');
  }, [onClose, handleBack]);

  if (!open) return null;

  const filtered = query
    ? OPDS_CATALOGS.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : OPDS_CATALOGS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={handleClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header - changes based on view */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200 flex-shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {selectedCatalog ? (
              <button
                onClick={handleBack}
                className="flex items-center gap-2 text-sm font-medium text-stone-600 hover:text-stone-900 transition-colors flex-shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Back
              </button>
            ) : null}
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedCatalog ? selectedCatalog.accent : 'from-blue-500 to-blue-600'} flex items-center justify-center shadow-md flex-shrink-0`}>
                {selectedCatalog ? (
                  <BookMarked className="w-5 h-5 text-white" />
                ) : (
                  <Globe className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-serif font-bold text-stone-800 truncate">
                  {selectedCatalog ? feedTitle : 'Online Library'}
                </h2>
                <p className="text-sm text-stone-500 truncate">
                  {selectedCatalog ? selectedCatalog.name : 'Browse free OPDS catalogs to discover and download ebooks'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        {selectedCatalog ? (
          /* Book List View */
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 className="w-8 h-8 text-amber-600 animate-spin mb-3" />
                <p className="text-sm text-stone-500">Loading books from {selectedCatalog.name}...</p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <AlertCircle className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-red-600 text-center mb-1">{error}</p>
                <p className="text-xs text-stone-400 text-center mb-4">Could not load this catalog's books. The catalog may be temporarily unavailable.</p>
                <button
                  onClick={() => handleShowCatalog(selectedCatalog)}
                  className="text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : books.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-sm text-stone-400">No books found in this catalog.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs text-stone-400 px-2 pb-2">{books.length} books found</p>
                {books.map((book, idx) => (
                  <div
                    key={`${book.id}-${idx}`}
                    className="flex items-start gap-4 p-3 rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-sm transition-all group"
                  >
                    {/* Cover or placeholder */}
                    <div className="w-14 h-20 rounded-lg flex-shrink-0 overflow-hidden bg-stone-100 border border-stone-200">
                      {book.coverUrl ? (
                        <img
                          src={book.coverUrl}
                          alt=""
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            (e.target as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center">
                          <BookOpen className="w-5 h-5 text-stone-300" />
                        </div>
                      )}
                    </div>

                    {/* Book details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 mb-0.5">
                        {book.title}
                      </h4>
                      <p className="text-xs text-stone-500 mb-1">{book.author}</p>
                      {book.categories.length > 0 && (
                        <div className="flex flex-wrap gap-1 mb-1">
                          {book.categories.slice(0, 3).map((cat, i) => (
                            <span key={i} className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded font-medium">
                              {cat}
                            </span>
                          ))}
                        </div>
                      )}
                      {book.summary && (
                        <p className="text-xs text-stone-400 leading-relaxed line-clamp-2">{book.summary}</p>
                      )}
                    </div>

                    {/* Download button */}
                    {book.downloadUrl && (
                      <a
                        href={book.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all flex-shrink-0 whitespace-nowrap"
                      >
                        <Download className="w-3.5 h-3.5" />
                        {book.downloadType.includes('epub') ? 'EPUB'
                          : book.downloadType.includes('pdf') ? 'PDF'
                          : book.downloadType.includes('text') ? 'TXT'
                          : 'Get'}
                      </a>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          /* Catalog List View */
          <>
            {/* Search */}
            <div className="px-6 pt-4 pb-2 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalogs..."
                  className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
                />
              </div>
            </div>

            {/* Info banner */}
            <div className="px-6 py-2 flex-shrink-0">
              <p className="text-xs text-stone-400 flex items-center gap-1.5">
                <BookOpen className="w-3.5 h-3.5" />
                OPDS (Open Publication Distribution System) catalogs let you browse and download free ebooks directly.
              </p>
            </div>

            {/* Catalog list */}
            <div className="overflow-y-auto px-6 pb-6 pt-2 space-y-3">
              {filtered.map((catalog) => (
                <div
                  key={catalog.name}
                  className="flex items-start gap-4 p-4 rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-md transition-all group"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${catalog.accent} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <BookOpen className="w-5 h-5 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <h3 className="font-serif font-semibold text-stone-800 text-base">{catalog.name}</h3>
                      <span className="text-xs px-2 py-0.5 bg-stone-100 text-stone-600 rounded-full font-medium whitespace-nowrap">
                        {catalog.count}
                      </span>
                    </div>
                    <p className="text-sm text-stone-500 leading-relaxed mb-3">{catalog.description}</p>
                    <div className="flex items-center gap-2 flex-wrap">
                      <button
                        onClick={() => handleShowCatalog(catalog)}
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 px-3 py-1.5 rounded-lg transition-all"
                      >
                        <BookMarked className="w-3.5 h-3.5" />
                        Browse Books
                      </button>
                      <span className="text-stone-300">|</span>
                      <a
                        href={catalog.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        Visit website
                      </a>
                    </div>
                  </div>
                </div>
              ))}

              {filtered.length === 0 && (
                <div className="text-center py-12">
                  <p className="text-stone-400 text-sm">No catalogs found matching "{query}"</p>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

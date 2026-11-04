import { Modal } from '@/shared/ui';
import { useCatalogController, canImportBook, getReadableFormat, type OpdsCatalog } from '@/features/catalog';
import { X, Globe, ExternalLink, BookOpen, Search, ArrowLeft, Loader2, Download, AlertCircle, BookMarked, BookPlus } from 'lucide-react';
import type { Document } from '@/domain/documents';

interface OnlineLibraryModalProps {
  open: boolean;
  onClose: () => void;
  onBookAdded: (document: Document) => void;
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
    url: 'https://standardebooks.org/feeds/atom/new-releases',
    website: 'https://standardebooks.org/',
    description: 'The latest beautifully formatted, carefully proofread public domain ebooks, with direct EPUB downloads.',
    count: 'Latest releases',
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
];

export function OnlineLibraryModal({ open, onClose, onBookAdded }: OnlineLibraryModalProps) {
  const { loadCatalog, query, setQuery, rssFeedUrl, setRssFeedUrl, selectedCatalog, books, feedTitle, loading, checkingSecurity, error, addingBookId, turnstileContainerRef, handleShowCatalog, handleBrowseCatalog, handleAddBook, handleLoadRssFeed, handleBack, handleClose } = useCatalogController(open, onClose, onBookAdded);

  if (!open) return null;

  const filtered = query
    ? OPDS_CATALOGS.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : OPDS_CATALOGS;

  return (
    <Modal label="Online library" className="fixed inset-0 z-50 flex items-center justify-center p-4" onClose={handleClose}>
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
                aria-label="Back to catalogs"
                title="Back to catalogs"
                className="flex items-center text-stone-600 hover:text-stone-900 transition-colors flex-shrink-0"
              >
                <ArrowLeft aria-hidden="true" className="w-4 h-4" />
              </button>
            ) : null}
            <div className="flex items-center gap-3 min-w-0">
              <div className={`w-10 h-10 rounded-xl bg-gradient-to-br ${selectedCatalog ? selectedCatalog.accent : 'from-blue-500 to-blue-600'} flex items-center justify-center shadow-md flex-shrink-0`}>
                {selectedCatalog ? (
                  <BookMarked aria-hidden="true" className="w-5 h-5 text-white" />
                ) : (
                  <Globe aria-hidden="true" className="w-5 h-5 text-white" />
                )}
              </div>
              <div className="min-w-0">
                <h2 className="text-xl font-serif font-bold text-stone-800 truncate">
                  {selectedCatalog ? feedTitle : 'Online Library'}
                </h2>
                <p className="text-sm text-stone-500 truncate">
                  {selectedCatalog ? selectedCatalog.name : 'Browse OPDS catalogs or read an RSS feed'}
                </p>
              </div>
            </div>
          </div>
          <button
            onClick={handleClose}
            aria-label="Close online library"
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors flex-shrink-0"
          >
            <X aria-hidden="true" className="w-4 h-4 text-stone-500" />
          </button>
        </div>

        <div
          ref={turnstileContainerRef}
          className="flex justify-center px-6 empty:hidden"
          aria-label="Public feed security check"
        />

        {selectedCatalog ? (
          /* Book List View */
          <div className="flex-1 overflow-y-auto">
            {loading ? (
              <div className="flex flex-col items-center justify-center py-20">
                <Loader2 aria-hidden="true" className="w-8 h-8 text-amber-600 animate-spin mb-3" />
                <p className="text-sm text-stone-500">
                  {checkingSecurity
                    ? 'Complete the security check to browse this feed...'
                    : `Loading feed entries from ${selectedCatalog.name}...`}
                </p>
              </div>
            ) : error ? (
              <div className="flex flex-col items-center justify-center py-20 px-6">
                <div className="w-12 h-12 rounded-full bg-red-50 flex items-center justify-center mb-4">
                  <AlertCircle aria-hidden="true" className="w-6 h-6 text-red-500" />
                </div>
                <p className="text-sm text-red-600 text-center mb-1">{error}</p>
                <p className="text-xs text-stone-400 text-center mb-4">Could not load this feed. It may be temporarily unavailable or return an unsupported format.</p>
                <button
                  onClick={() => loadCatalog(selectedCatalog)}
                  className="text-sm font-medium text-amber-600 hover:text-amber-700 transition-colors"
                >
                  Try again
                </button>
              </div>
            ) : books.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-20">
                <p className="text-sm text-stone-400">No feed entries found.</p>
              </div>
            ) : (
              <div className="p-4 space-y-2">
                <p className="text-xs text-stone-400 px-2 pb-2">{books.length} feed entries found</p>
                <p className="text-xs text-stone-500 px-2 pb-2">
                  Only Project Gutenberg entries explicitly marked public domain in the USA can be added. Imported books are shared with all signed-in Lumiere users.
                </p>
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
                          <BookOpen aria-hidden="true" className="w-5 h-5 text-stone-300" />
                        </div>
                      )}
                    </div>

                    {/* Book details */}
                    <div className="flex-1 min-w-0">
                      <h4 className="text-sm font-medium text-stone-800 leading-snug line-clamp-2 mb-0.5">
                        {book.title}
                      </h4>
                      <p className="text-xs text-stone-500 mb-1">{book.author}</p>
                      {book.updated && (
                        <p className="text-[10px] text-stone-400 mb-1">{book.updated}</p>
                      )}
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

                    {book.catalogUrl && (
                      <button
                        onClick={() => handleBrowseCatalog({
                          name: book.title,
                          url: book.catalogUrl,
                          website: book.catalogUrl,
                          description: 'OPDS subcatalog',
                          count: 'OPDS subcatalog',
                          accent: selectedCatalog.accent,
                        })}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-stone-700 bg-stone-100 hover:bg-stone-200 border border-stone-200 rounded-lg transition-all flex-shrink-0 whitespace-nowrap"
                      >
                        <BookOpen aria-hidden="true" className="w-3.5 h-3.5" />
                        Browse
                      </button>
                    )}

                    {/* Download button */}
                    {book.downloadUrl && (
                      <a
                        href={book.downloadUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-all flex-shrink-0 whitespace-nowrap"
                      >
                        {book.downloadType.includes('html')
                          ? <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
                          : <Download aria-hidden="true" className="w-3.5 h-3.5" />}
                        {book.downloadType.includes('epub') ? 'EPUB'
                          : book.downloadType.includes('pdf') ? 'PDF'
                          : book.downloadType.includes('text') ? 'TXT'
                          : book.downloadType.includes('html') ? 'Read'
                          : 'Open'}
                      </a>
                    )}
                    {getReadableFormat(book) && canImportBook(selectedCatalog?.url, book) && (
                      <button
                        onClick={() => void handleAddBook(book)}
                        disabled={addingBookId !== null}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-green-700 hover:bg-green-600 disabled:opacity-60 disabled:cursor-wait rounded-lg transition-all flex-shrink-0 whitespace-nowrap"
                      >
                        {addingBookId === book.id
                          ? <Loader2 aria-hidden="true" className="w-3.5 h-3.5 animate-spin" />
                          : <BookPlus aria-hidden="true" className="w-3.5 h-3.5" />}
                        {addingBookId === book.id ? 'Adding...' : 'Add to Shared Library'}
                      </button>
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
                <Search aria-hidden="true" className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-stone-400" />
                <input
                  type="text"
                  aria-label="Search online catalog" value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search catalogs..."
                  className="w-full pl-11 pr-4 py-3 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
                />
              </div>
            </div>

            {/* Info banner */}
            <div className="px-6 py-2 flex-shrink-0">
              <p className="text-xs text-stone-400 flex items-center gap-1.5">
                <BookOpen aria-hidden="true" className="w-3.5 h-3.5" />
                Browse OPDS catalogs or enter an RSS/Atom feed URL to read its latest entries.
              </p>
            </div>

            <form onSubmit={handleLoadRssFeed} className="px-6 py-3 flex items-center gap-2 flex-shrink-0">
              <input
                type="url"
                value={rssFeedUrl}
                onChange={(event) => setRssFeedUrl(event.target.value)}
                placeholder="https://example.com/feed.xml"
                aria-label="RSS feed URL"
                required
                className="min-w-0 flex-1 px-4 py-2.5 bg-stone-50 border border-stone-200 rounded-xl text-stone-800 placeholder-stone-400 text-sm focus:outline-none focus:ring-2 focus:ring-amber-600/30 focus:border-amber-600/40 transition-all"
              />
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 text-xs font-medium text-white bg-amber-600 hover:bg-amber-500 px-3 py-2.5 rounded-lg transition-all flex-shrink-0"
              >
                <BookMarked aria-hidden="true" className="w-3.5 h-3.5" />
                Read Feed
              </button>
            </form>

            {/* Catalog list */}
            <div className="overflow-y-auto px-6 pb-6 pt-2 space-y-3">
              {filtered.map((catalog) => (
                <div
                  key={catalog.name}
                  className="flex items-start gap-4 p-4 rounded-xl border border-stone-200 hover:border-stone-300 hover:shadow-md transition-all group"
                >
                  <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${catalog.accent} flex items-center justify-center flex-shrink-0 shadow-sm`}>
                    <BookOpen aria-hidden="true" className="w-5 h-5 text-white" />
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
                        <BookMarked aria-hidden="true" className="w-3.5 h-3.5" />
                        Browse Books
                      </button>
                      <span className="text-stone-300">|</span>
                      <a
                        href={catalog.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
                      >
                        <ExternalLink aria-hidden="true" className="w-3.5 h-3.5" />
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
    </Modal>
  );
}

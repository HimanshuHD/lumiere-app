import { useState } from 'react';
import { X, Globe, ExternalLink, BookOpen, Loader2, Search } from 'lucide-react';

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

  if (!open) return null;

  const filtered = query
    ? OPDS_CATALOGS.filter((c) =>
        c.name.toLowerCase().includes(query.toLowerCase()) ||
        c.description.toLowerCase().includes(query.toLowerCase())
      )
    : OPDS_CATALOGS;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-stone-200 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md shadow-blue-500/20">
              <Globe className="w-5 h-5 text-white" />
            </div>
            <div>
              <h2 className="text-xl font-serif font-bold text-stone-800">Online Library</h2>
              <p className="text-sm text-stone-500">Browse free OPDS catalogs to discover and download ebooks</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-stone-100 hover:bg-stone-200 flex items-center justify-center transition-colors"
          >
            <X className="w-4 h-4 text-stone-500" />
          </button>
        </div>

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
                <div className="flex items-center gap-2">
                  <a
                    href={catalog.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 text-xs font-medium text-stone-600 hover:text-stone-800 transition-colors"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Visit website
                  </a>
                  <span className="text-stone-300">|</span>
                  <span className="inline-flex items-center gap-1.5 text-xs text-stone-400">
                    <Globe className="w-3.5 h-3.5" />
                    OPDS feed available
                  </span>
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
      </div>
    </div>
  );
}

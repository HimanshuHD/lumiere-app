import { BookOpen, BookMarked } from 'lucide-react';
import { Document } from '@/lib/supabase';
import { useBookmarks, useReadingProgress } from '@/hooks/useData';
import { DocumentCover } from '@/components/DocumentCover';
import { useAuth } from '@/context/AuthContext';
import { DocumentAccessNotice } from '@/components/DocumentAccessNotice';
import { isDocumentLockedForUser } from '@/lib/documentAccess';

interface BookmarksViewProps {
  onOpenDoc: (doc: Document) => void;
}

export function BookmarksView({ onOpenDoc }: BookmarksViewProps) {
  const { bookmarks, loading } = useBookmarks();
  const { getProgress } = useReadingProgress();
  const { user } = useAuth();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-amber-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 rounded-xl bg-amber-100 flex items-center justify-center">
          <BookMarked className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Bookmarks</h1>
          <p className="text-sm text-stone-500">{bookmarks.length} saved {bookmarks.length === 1 ? 'document' : 'documents'}</p>
        </div>
      </div>

      {bookmarks.length === 0 ? (
        <div className="text-center py-24">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4">
            <BookOpen className="w-8 h-8 text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm mb-1">No bookmarks yet</p>
          <p className="text-stone-400 text-xs">Bookmark documents from the reader to save them here.</p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {bookmarks.map((bm) => {
            const doc = bm.document;
            if (!doc) return null;
            const locked = isDocumentLockedForUser(doc, user?.id);
            const prog = getProgress(doc.id);
            const totalPercent = prog
              ? Math.round(((prog.chapter_index + prog.scroll_percent) / doc.chapters.length) * 100)
              : 0;
            return (
              <div
                key={bm.id}
                onClick={() => !locked && onOpenDoc(doc)}
                aria-disabled={locked}
                className={`group ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
              >
                <div className="relative aspect-[3/4] rounded-xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all">
                  <DocumentCover
                    document={doc}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  {locked && <DocumentAccessNotice overlay />}
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                    <BookMarked className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  {totalPercent > 0 && (
                    <div className="absolute bottom-0 left-0 right-0 h-1 bg-black/20">
                      <div className="h-full bg-amber-500" style={{ width: `${totalPercent}%` }} />
                    </div>
                  )}
                </div>
                <h3 className="font-serif font-semibold text-stone-800 text-sm leading-snug line-clamp-2 group-hover:text-amber-700 transition-colors">
                  {doc.title}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">{doc.author}</p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

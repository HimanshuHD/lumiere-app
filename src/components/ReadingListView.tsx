import { BookOpen, Clock, ListTodo } from 'lucide-react';
import { Document } from '@/lib/supabase';
import { useReadingList } from '@/hooks/useData';
import { ReadLaterButton } from '@/components/ReadLaterButton';
import { DocumentCover } from '@/components/DocumentCover';
import { useAuth } from '@/context/AuthContext';
import { DocumentAccessNotice } from '@/components/DocumentAccessNotice';
import { isDocumentLockedForUser } from '@/lib/documentAccess';

interface ReadingListViewProps {
  onOpenDoc: (doc: Document) => void;
}

export function ReadingListView({ onOpenDoc }: ReadingListViewProps) {
  const { readingList, loading } = useReadingList();
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
          <ListTodo className="w-5 h-5 text-amber-700" />
        </div>
        <div>
          <h1 className="text-2xl font-serif font-bold text-stone-800">Reading List</h1>
          <p className="text-sm text-stone-500">
            {readingList.length} {readingList.length === 1 ? 'book' : 'books'} saved to read later
          </p>
        </div>
      </div>

      {readingList.length === 0 ? (
        <div className="text-center py-24">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-stone-100 mb-4">
            <BookOpen className="w-8 h-8 text-stone-400" />
          </div>
          <p className="text-stone-500 text-sm mb-1">Your reading list is empty</p>
          <p className="text-stone-400 text-xs">
            Browse the library and tap "Read Later" to save books for another time.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-6">
          {readingList.map((item) => {
            const doc = item.document;
            if (!doc) return null;
            const locked = isDocumentLockedForUser(doc, user?.id);
            return (
              <div key={item.id} className="group">
                <div
                  onClick={() => !locked && onOpenDoc(doc)}
                  aria-disabled={locked}
                  className={`relative aspect-[3/4] rounded-xl overflow-hidden mb-3 shadow-md group-hover:shadow-xl transition-all ${locked ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}
                >
                  <DocumentCover
                    document={doc}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                  {locked && <DocumentAccessNotice overlay />}
                  <div className="absolute top-2 right-2 w-7 h-7 rounded-full bg-white/90 flex items-center justify-center shadow-md">
                    <Clock className="w-3.5 h-3.5 text-amber-600" />
                  </div>
                  {!locked && <div className="absolute bottom-3 left-3 right-3 opacity-0 group-hover:opacity-100 translate-y-2 group-hover:translate-y-0 transition-all">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white/95 text-stone-900 text-xs font-medium rounded-lg shadow-lg">
                      Start Reading
                    </span>
                  </div>}
                </div>
                <h3 className="font-serif font-semibold text-stone-800 text-sm leading-snug line-clamp-2 group-hover:text-amber-700 transition-colors">
                  {doc.title}
                </h3>
                <p className="text-xs text-stone-500 mt-0.5">{doc.author}</p>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-[10px] px-1.5 py-0.5 bg-stone-100 text-stone-500 rounded font-medium">
                    {doc.category}
                  </span>
                  <span className="flex items-center gap-0.5 text-[10px] text-stone-400">
                    <Clock className="w-2.5 h-2.5" />
                    {doc.reading_time}m
                  </span>
                  <ReadLaterButton doc={doc} variant="compact" className="ml-auto -mr-1" />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

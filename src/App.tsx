import { useState, useCallback } from 'react';
import { BookOpen, BookMarked, Library as LibraryIcon, LogOut, Loader2, Upload } from 'lucide-react';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import { AuthScreen } from '@/components/AuthScreen';
import { Library } from '@/components/Library';
import { BookmarksView } from '@/components/BookmarksView';
import { Reader } from '@/components/Reader';
import { UploadPanel } from '@/components/UploadPanel';
import { useDocuments } from '@/hooks/useData';
import { Document } from '@/lib/supabase';

type View = 'library' | 'bookmarks' | 'upload';

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const { documents, loading: docsLoading, refetch } = useDocuments();
  const [view, setView] = useState<View>('library');
  const [activeDoc, setActiveDoc] = useState<Document | null>(null);

  const handleUploaded = useCallback((_doc: Document) => {
    refetch();
    setView('library');
  }, [refetch]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  // Reader view (full screen, replaces layout)
  if (activeDoc) {
    return <Reader document={activeDoc} onBack={() => setActiveDoc(null)} />;
  }

  const navItems: { key: View; label: string; icon: typeof LibraryIcon }[] = [
    { key: 'library', label: 'Library', icon: LibraryIcon },
    { key: 'bookmarks', label: 'Bookmarks', icon: BookMarked },
    { key: 'upload', label: 'Upload', icon: Upload },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-30 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-md shadow-amber-600/20">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="font-serif font-bold text-stone-900 text-xl tracking-tight">Lumiere</span>
            </div>

            <div className="hidden sm:flex items-center gap-1">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => setView(key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    view === key
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-500 hover:text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:block text-right">
              <p className="text-xs text-stone-500">Signed in as</p>
              <p className="text-sm font-medium text-stone-700">{user.email}</p>
            </div>
            <button
              onClick={signOut}
              className="p-2 rounded-lg text-stone-500 hover:text-stone-800 hover:bg-stone-100 transition-colors"
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex items-center gap-1 px-4 pb-2">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setView(key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === key ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      <main>
        {view === 'library' && (
          <Library
            documents={documents}
            loading={docsLoading}
            onOpenDoc={setActiveDoc}
          />
        )}
        {view === 'bookmarks' && <BookmarksView onOpenDoc={setActiveDoc} />}
        {view === 'upload' && <UploadPanel onUploaded={handleUploaded} />}
      </main>

      {/* Footer */}
      <footer className="border-t border-stone-200 mt-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-stone-400 text-xs">
            <BookOpen className="w-4 h-4" />
            <span>Lumiere · A quiet space for great stories</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <AppContent />
    </AuthProvider>
  );
}

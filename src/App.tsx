import { IntegrationContext } from '@/shared/integrations';
import { setActiveAccount } from '@/app/account-runtime';
import { integrations } from '@/app/integrations';
import { useState, useCallback, useEffect } from 'react';
import { BookOpen, BookMarked, Library as LibraryIcon, Loader2, ListTodo } from 'lucide-react';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/features/auth';
import { ToastProvider, useToast } from '@/shared/ui';
import { AuthScreen } from '@/components/AuthScreen';
import { Library } from '@/components/Library';
import { BookmarksView } from '@/components/BookmarksView';
import { ReaderLoader } from '@/components/ReaderLoader';
import { QueryNotice } from '@/shared/ui';
import type {  DocumentSummary  } from '@/domain/document-summary';
import {  summarizeDocument  } from '@/domain/document-summary';
import { UploadPanel } from '@/components/UploadPanel';
import { Profile } from '@/components/Profile';
import { MyUploads } from '@/components/MyUploads';
import { UserMenu } from '@/components/UserMenu';
import { AllDocuments } from '@/components/AllDocuments';
import { ReadingListView } from '@/components/ReadingListView';
import { ImportMenu } from '@/components/ImportMenu';
import { OnlineLibraryModal } from '@/components/OnlineLibraryModal';
import { CatalogAdmin } from '@/components/CatalogAdmin';
import { isCatalogAdmin } from '@/lib/catalogAdminAccess';
import { useDocuments } from '@/hooks/useData';
import type { Document } from '@/domain/documents';

type View = 'library' | 'bookmarks' | 'reading-list' | 'upload' | 'profile' | 'my-uploads' | 'all-documents' | 'admin-catalog';

function getViewFromLocation(): View {
  return window.location.pathname === '/admin/catalog' ? 'admin-catalog' : 'library';
}

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const { showToast } = useToast();
  const handleSignOut = async () => { const result = await signOut(); if (!result.ok) showToast(result.error.message, 'error'); };
  const { documents, loading: docsLoading, error: docsError, refetch } = useDocuments();
  const [view, setView] = useState<View>(getViewFromLocation);
  const [activeDoc, setActiveDoc] = useState<DocumentSummary | null>(null);
  const [showOnlineLibrary, setShowOnlineLibrary] = useState(false);
  const openDocument = useCallback((doc: DocumentSummary | Document) => setActiveDoc('chapters' in doc ? summarizeDocument(doc) : doc), []);
  const catalogAdmin = isCatalogAdmin(user);

  const navigateToView = useCallback((nextView: View) => {
    const nextPath = nextView === 'admin-catalog' ? '/admin/catalog' : '/';
    if (window.location.pathname !== nextPath) {
      window.history.pushState(null, '', nextPath);
    }
    setActiveDoc(null);
    setView(nextView);
  }, []);

  useEffect(() => {
    const handlePopState = () => {
      setActiveDoc(null);
      setView(getViewFromLocation());
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleUploaded = useCallback(() => {
    refetch();
    navigateToView('library');
  }, [navigateToView, refetch]);

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

  const navItems: { key: View; label: string; icon: typeof LibraryIcon }[] = [
    { key: 'library', label: 'Library', icon: LibraryIcon },
    { key: 'bookmarks', label: 'Bookmarks', icon: BookMarked },
    { key: 'reading-list', label: 'Reading List', icon: ListTodo },
  ];

  return (
    <div className="min-h-screen bg-stone-50">
      {/* Navigation */}
      <nav className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between">
          <div className="flex items-center gap-8">
            <button
              onClick={() => navigateToView('library')}
              className="flex items-center gap-2.5"
            >
              <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-600 to-amber-700 flex items-center justify-center shadow-md shadow-amber-600/20">
                <BookOpen className="w-5 h-5 text-white" />
              </div>
              <span className="font-serif font-bold text-stone-900 text-xl tracking-tight">Lumiere</span>
            </button>

            <div className="hidden sm:flex items-center gap-1">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => navigateToView(key)}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    view === key && !activeDoc
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
            <ImportMenu
              onUpload={() => navigateToView('upload')}
              onOnlineLibrary={() => { setShowOnlineLibrary(true); }}
            />
            <UserMenu
              onProfile={() => navigateToView('profile')}
              onMyUploads={() => navigateToView('my-uploads')}
              onAdminCatalog={() => navigateToView('admin-catalog')}
              onSignOut={handleSignOut}
            />
          </div>
        </div>

        {/* Mobile nav */}
        <div className="sm:hidden flex items-center gap-1 px-4 pb-2">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => navigateToView(key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === key && !activeDoc ? 'bg-stone-900 text-white' : 'text-stone-500 hover:bg-stone-100'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {label}
            </button>
          ))}
        </div>
      </nav>

      {/* Main content */}
      {!activeDoc && (view === 'library' || view === 'all-documents') && <QueryNotice error={docsError} retry={refetch} label="library" />}
      <main>
        {view === 'admin-catalog' ? (
          catalogAdmin ? (
            <CatalogAdmin onBack={() => navigateToView('library')} />
          ) : (
            <div className="max-w-3xl mx-auto px-4 py-24 text-center">
              <h1 className="text-2xl font-serif font-bold text-stone-800">Administrator access required</h1>
              <p className="mt-2 text-sm text-stone-500">This catalog maintenance page is restricted to authorized administrators.</p>
              <button
                onClick={() => navigateToView('library')}
                className="mt-6 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
              >
                Return to library
              </button>
            </div>
          )
        ) : activeDoc ? (
          <ReaderLoader document={activeDoc} onBack={() => setActiveDoc(null)} />
        ) : (
          <>
            {view === 'library' && !(docsError && documents.length === 0) && (
              <Library
                documents={documents}
                loading={docsLoading && documents.length === 0}
                onOpenDoc={openDocument}
                onViewAll={() => navigateToView('all-documents')}
              />
            )}
            {view === 'bookmarks' && <BookmarksView onOpenDoc={openDocument} />}
            {view === 'reading-list' && <ReadingListView onOpenDoc={openDocument} />}
            {view === 'upload' && <UploadPanel onUploaded={handleUploaded} />}
            {view === 'profile' && <Profile />}
            {view === 'my-uploads' && <MyUploads />}
            {view === 'all-documents' && !(docsError && documents.length === 0) && (
              <AllDocuments
                documents={documents}
                loading={docsLoading && documents.length === 0}
                onOpenDoc={openDocument}
                onBack={() => navigateToView('library')}
                onCollectionChanged={async () => { await refetch(); }}
              />
            )}
          </>
        )}
      </main>

      {/* Footer (hidden in reader view) */}
      {!activeDoc && (
        <footer className="border-t border-stone-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-400 text-xs">
              <BookOpen className="w-4 h-4" />
              <span>Lumiere · A quiet space for great stories</span>
            </div>
          </div>
        </footer>
      )}

      <OnlineLibraryModal
        open={showOnlineLibrary}
        onClose={() => setShowOnlineLibrary(false)}
        onBookAdded={(doc) => {
          refetch();
          setShowOnlineLibrary(false);
          openDocument(doc);
        }}
      />
    </div>
  );
}

function AccountContent() {
  const { user } = useAuth();
  return <ToastProvider key={user?.id ?? 'signed-out'}><AppContent /></ToastProvider>;
}

export default function App() {
  return (
    <IntegrationContext.Provider value={integrations}><AuthProvider onAccountChange={setActiveAccount}>
      <AccountContent />
    </AuthProvider></IntegrationContext.Provider>
  );
}

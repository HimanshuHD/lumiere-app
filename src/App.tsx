import { IntegrationContext } from '@/shared/integrations';
import { applySessionAccount } from '@/app/session-navigation';
import { integrations } from '@/app/integrations';
import { lazy, useState, useCallback, useEffect, useLayoutEffect } from 'react';
import { SessionNavigationBoundary } from '@/app/SessionNavigationBoundary';
import { OAuthCallback } from '@/app/OAuthCallback';
import { BookMarked, Library as LibraryIcon, Loader2, ListTodo } from 'lucide-react';
import { AuthProvider } from '@/context/AuthContext';
import { useAuth } from '@/features/auth';
import { ToastProvider, useToast } from '@/shared/ui';
import { AuthScreen } from '@/components/AuthScreen';
import { Library } from '@/components/Library';
import { BookmarksView } from '@/components/BookmarksView';
import { QueryNotice } from '@/shared/ui';
import type {  DocumentSummary  } from '@/domain/document-summary';
import { UserMenu } from '@/components/UserMenu';
import { AllDocuments } from '@/components/AllDocuments';
import { ReadingListView } from '@/components/ReadingListView';
import { ImportMenu } from '@/components/ImportMenu';
import { isCatalogAdmin } from '@/lib/catalogAdminAccess';
import { useDocuments } from '@/hooks/useData';
import type { Document } from '@/domain/documents';

import type { View } from '@/domain/navigation';
import { navigate, useAppRoute } from '@/app/navigation';
import { DeferredContent } from '@/app/DeferredContent';
import { BrandLogo } from '@/shared/ui/brand-logo';
import { ThemeToggle } from '@/shared/ui/theme-toggle';

const ReaderLoader = lazy(() => import('@/components/ReaderLoader').then(module => ({ default: module.ReaderLoader })));
const UploadPanel = lazy(() => import('@/components/UploadPanel').then(module => ({ default: module.UploadPanel })));
const Profile = lazy(() => import('@/components/Profile').then(module => ({ default: module.Profile })));
const MyUploads = lazy(() => import('@/components/MyUploads').then(module => ({ default: module.MyUploads })));
const OnlineLibraryModal = lazy(() => import('@/components/OnlineLibraryModal').then(module => ({ default: module.OnlineLibraryModal })));
const CatalogAdmin = lazy(() => import('@/components/CatalogAdmin').then(module => ({ default: module.CatalogAdmin })));

function AppContent() {
  const { user, loading, signOut } = useAuth();
  const { showToast } = useToast();
  const handleSignOut = async () => { const result = await signOut(); if (!result.ok) showToast(result.error.message, 'error'); };
  const { documents, loading: docsLoading, error: docsError, refetch } = useDocuments();
  const route = useAppRoute();
  const view = route.kind === 'view' ? route.view : null;
  const activeDoc = route.kind === 'reader' ? route.documentId : null;
  const [showOnlineLibrary, setShowOnlineLibrary] = useState(false);
  const [hasOpenedOnlineLibrary, setHasOpenedOnlineLibrary] = useState(false);
  const routeIdentity = route.kind === 'view' ? route.view : route.kind === 'reader' ? route.documentId : route.kind;
  useEffect(() => { setShowOnlineLibrary(false); }, [routeIdentity]);
  const openDocument = useCallback((doc: DocumentSummary | Document) => navigate({kind: 'reader', documentId: doc.id}), []);
  const catalogAdmin = isCatalogAdmin(user);

  const navigateToView = useCallback((view: View) => {
    setShowOnlineLibrary(false);
    navigate({kind: 'view', view});
  }, []);

  const handleUploaded = useCallback(() => {
    refetch();
    navigateToView('library');
  }, [navigateToView, refetch]);

  useLayoutEffect(() => {
    if (!loading) {
      document.getElementById('startup-screen')?.dispatchEvent(new Event('lumiere:startup-ready'));
    }
  }, [loading]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-stone-900">
        <Loader2 className="w-8 h-8 text-amber-500 animate-spin" />
      </div>
    );
  }

  if (route.kind === 'callback') return <div className="theme-scope"><ThemeToggle className="auth-theme-toggle" /><OAuthCallback /></div>;

  if (!user) {
    return <AuthScreen />;
  }

  const navItems: { key: View; label: string; icon: typeof LibraryIcon }[] = [
    { key: 'library', label: 'Library', icon: LibraryIcon },
    { key: 'bookmarks', label: 'Bookmarks', icon: BookMarked },
    { key: 'reading-list', label: 'Reading List', icon: ListTodo },
  ];

  return (
    <div className="app-frame min-h-screen">
      <a href="#main-content" className="skip-link">Skip to content</a>
      {/* Navigation */}
      <nav className="theme-scope sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-stone-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 min-h-16 py-3 flex flex-wrap gap-3 items-center justify-between">
          <div className="flex items-center gap-4 lg:gap-8">
            <button
              onClick={() => navigateToView('library')}
              className="flex items-center gap-2.5"
            >
              <BrandLogo className="w-10 h-8" />
              <span className="font-serif font-bold text-stone-900 text-xl tracking-tight">Lumiere</span>
            </button>

            <div className="hidden lg:flex items-center gap-1">
              {navItems.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => navigateToView(key)}
                  aria-current={view === key && !activeDoc ? 'page' : undefined}
                  className={`flex items-center gap-2 px-3.5 py-2 rounded-lg text-sm font-medium transition-all ${
                    view === key && !activeDoc
                      ? 'bg-stone-900 text-white'
                      : 'text-stone-600 hover:text-stone-800 hover:bg-stone-100'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="nav-tools flex items-center gap-2 sm:gap-3">
            <ThemeToggle />
            <ImportMenu
              onUpload={() => navigateToView('upload')}
              onOnlineLibrary={() => {
                setHasOpenedOnlineLibrary(true);
                setShowOnlineLibrary(true);
              }}
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
        <div className="lg:hidden flex items-center gap-1 px-4 pb-2">
          {navItems.map(({ key, label, icon: Icon }) => (
            <button
              key={key}
              onClick={() => navigateToView(key)}
                  aria-current={view === key && !activeDoc ? 'page' : undefined}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                view === key && !activeDoc ? 'bg-stone-900 text-white' : 'text-stone-600 hover:bg-stone-100'
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
      <main id="main-content" tabIndex={-1} className={activeDoc ? undefined : "theme-scope"}>
        <DeferredContent key={routeIdentity}>
          {route.kind === 'not-found' ? (
            <div className="max-w-3xl mx-auto px-4 py-24 text-center">
              <h1 className="text-2xl font-serif font-bold">Page unavailable</h1>
              <button className="mt-6 underline" onClick={() => navigate({kind:'view',view:'library'},{replace:true})}>Return to library</button>
            </div>
          ) : view === 'admin-catalog' ? (
            catalogAdmin ? (
              <CatalogAdmin onBack={() => navigateToView('library')} />
            ) : (
              <div className="max-w-3xl mx-auto px-4 py-24 text-center">
                <h1 className="text-2xl font-serif font-bold text-stone-800">Administrator access required</h1>
                <p className="mt-2 text-sm text-stone-600">This catalog maintenance page is restricted to authorized administrators.</p>
                <button
                  onClick={() => navigateToView('library')}
                  className="mt-6 rounded-lg bg-stone-900 px-4 py-2 text-sm font-medium text-white hover:bg-stone-700"
                >
                  Return to library
                </button>
              </div>
            )
          ) : activeDoc ? (
            <ReaderLoader key={activeDoc} documentId={activeDoc} onBack={() => navigateToView('library')} />
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
        </DeferredContent>
      </main>

      {/* Footer (hidden in reader view) */}
      {!activeDoc && (
        <footer className="theme-scope border-t border-stone-200 mt-8">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6 flex items-center justify-between">
            <div className="flex items-center gap-2 text-stone-600 text-xs">
              <BrandLogo className="w-6 h-5" />
              <span>Lumiere · A quiet space for great stories</span>
            </div>
          </div>
        </footer>
      )}

      {hasOpenedOnlineLibrary && (
        <DeferredContent>
          <OnlineLibraryModal
            open={showOnlineLibrary}
            onClose={() => setShowOnlineLibrary(false)}
            onBookAdded={(doc) => {
              refetch();
              setShowOnlineLibrary(false);
              openDocument(doc);
            }}
          />
        </DeferredContent>
      )}
    </div>
  );
}

function AccountContent() {
  const { user } = useAuth();
  return <SessionNavigationBoundary><ToastProvider key={user?.id ?? 'signed-out'}><AppContent /></ToastProvider></SessionNavigationBoundary>;
}

export default function App() {
  return (
    <IntegrationContext.Provider value={integrations}><AuthProvider onAccountChange={applySessionAccount}>
      <AccountContent />
    </AuthProvider></IntegrationContext.Provider>
  );
}

import { attempt, requireValue } from '@/domain/errors';
import { useState, useCallback, useRef, useEffect, type FormEvent } from 'react';
import { useIntegrations } from '@/shared/integrations';
import { publicConfig } from '@/shared/config';
import type { OpdsBook } from '@/domain/catalog';
import type { Document } from '@/domain/documents';
import { useAuth } from '@/features/auth';
import { useToast } from '@/shared/ui';
import { requestTurnstileToken } from '@/lib/turnstile';
import { supabaseCatalogCollectionStore } from '@/app/document-operations';
import { importCatalogDocumentToCollection } from '@/services/catalogImport';
import { supabaseCatalogImportStore } from '@/app/document-operations';

export interface OpdsCatalog {
  name: string;
  url: string;
  website: string;
  description: string;
  count: string;
  accent: string;
}

export function getReadableFormat(book: OpdsBook): 'epub' | 'pdf' | null {
  const type = book.downloadType.toLowerCase();
  if (type.includes('epub') || /\.epub(?:3)?(?:$|[.?])/i.test(book.downloadUrl)) return 'epub';
  if (type.includes('pdf') || /\.pdf(?:$|[.?])/i.test(book.downloadUrl)) return 'pdf';
  return null;
}

export function canImportBook(catalogUrl: string | undefined, book: OpdsBook): boolean {
  if (!catalogUrl || !book.id || !/public domain in the usa/i.test(book.rights)) return false;
  try {
    const url = new URL(catalogUrl);
    return url.protocol === 'https:' &&
      ['gutenberg.org', 'www.gutenberg.org', 'm.gutenberg.org', 'aleph.gutenberg.org'].includes(url.hostname);
  } catch {
    return false;
  }
}


export function useCatalogController(open: boolean, onClose: () => void, onBookAdded: (document: Document) => void) {
  const { catalogFeed: fetchCatalogFeed } = useIntegrations();
  const pendingImport = useRef<symbol | null>(null);
  const active = useRef(true);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  const { user } = useAuth();
  const { showToast } = useToast();
  const [query, setQuery] = useState('');
  const [rssFeedUrl, setRssFeedUrl] = useState('');
  const [selectedCatalog, setSelectedCatalog] = useState<OpdsCatalog | null>(null);
  const [catalogHistory, setCatalogHistory] = useState<OpdsCatalog[]>([]);
  const [books, setBooks] = useState<OpdsBook[]>([]);
  const [feedTitle, setFeedTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [checkingSecurity, setCheckingSecurity] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [addingBookId, setAddingBookId] = useState<string | null>(null);
  const turnstileContainerRef = useRef<HTMLDivElement>(null);

  const request = useRef<AbortController | null>(null);
  const invalidateImport = useCallback(() => {
    pendingImport.current = null;
    setAddingBookId(null);
  }, []);
  useEffect(() => {
    if (!open) { request.current?.abort(); invalidateImport(); }
    return () => { request.current?.abort(); pendingImport.current = null; };
  }, [open, invalidateImport]);
  const loadCatalog = useCallback(async (catalog: OpdsCatalog) => {
    invalidateImport();
    request.current?.abort();
    const controller = new AbortController();
    request.current = controller;
    setSelectedCatalog(catalog);
    setBooks([]);
    setFeedTitle(catalog.name);
    setError(null);
    setLoading(true);
    setCheckingSecurity(false);
    try {
      const data = requireValue(await attempt(() => fetchCatalogFeed(catalog.url, async () => {
        if (controller.signal.aborted) throw new DOMException("Cancelled", "AbortError");
        const container = turnstileContainerRef.current;
        if (!container) throw new Error('The security check is unavailable. Please try again.');
        setCheckingSecurity(true);
        try { return await requestTurnstileToken(container, publicConfig.turnstileSiteKey, controller.signal); }
        finally { if (!controller.signal.aborted) setCheckingSecurity(false); }
      }, controller.signal)));
      if (controller.signal.aborted) return;
      setFeedTitle(data.title || catalog.name);
      setBooks(data.books);
    } catch (err) {
      if (controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : 'Failed to load catalog books');
    } finally {
      if (!controller.signal.aborted) { setCheckingSecurity(false); setLoading(false); }
    }
  }, [fetchCatalogFeed, invalidateImport]);

  const handleShowCatalog = useCallback((catalog: OpdsCatalog) => {
    setCatalogHistory([]);
    void loadCatalog(catalog);
  }, [loadCatalog]);

  const handleBrowseCatalog = useCallback((catalog: OpdsCatalog) => {
    if (selectedCatalog) {
      setCatalogHistory((history) => [...history, selectedCatalog]);
    }
    void loadCatalog(catalog);
  }, [loadCatalog, selectedCatalog]);

  const handleAddBook = useCallback(async (book: OpdsBook) => {
    if (pendingImport.current) return;
    if (!user) {
      showToast('Sign in to add books to your library.', 'error');
      return;
    }
    if (!selectedCatalog || !canImportBook(selectedCatalog.url, book)) {
      showToast('Only catalog entries explicitly marked public domain in the USA can be imported.', 'error');
      return;
    }
    const format = getReadableFormat(book);
    if (!format) {
      showToast('This catalog entry does not provide a readable EPUB or PDF edition.', 'error');
      return;
    }

    const token = Symbol('catalog import');
    pendingImport.current = token;
    const bookId = book.id;
    setAddingBookId(bookId);
    try {
      const collectionDocument = requireValue(await attempt(() => importCatalogDocumentToCollection(
        supabaseCatalogImportStore,
        supabaseCatalogCollectionStore,
        user.id,
        {
          catalogUrl: selectedCatalog.url,
          bookId,
          downloadUrl: book.downloadUrl,
          format,
        },
      )));
      if (!active.current || pendingImport.current !== token) return;
      showToast('Book added to your collection. Opening it now.');
      onBookAdded(collectionDocument);
    } catch (err) {
      if (active.current && pendingImport.current === token) showToast(err instanceof Error ? err.message : 'Could not add this book to your library.', 'error');
    } finally {
      if (pendingImport.current === token) {
        pendingImport.current = null;
        if (active.current) setAddingBookId(null);
      }
    }
  }, [onBookAdded, selectedCatalog, showToast, user]);

  const handleLoadRssFeed = useCallback((event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const url = rssFeedUrl.trim();
    if (!url) return;
    void handleShowCatalog({
      name: 'RSS Feed',
      url,
      website: url,
      description: 'RSS feed',
      count: 'RSS Feed',
      accent: 'from-blue-500 to-blue-600',
    });
  }, [handleShowCatalog, rssFeedUrl]);

  const handleBack = useCallback(() => {
    invalidateImport();
    const previousCatalog = catalogHistory[catalogHistory.length - 1];
    if (previousCatalog) {
      setCatalogHistory((history) => history.slice(0, -1));
      void loadCatalog(previousCatalog);
      return;
    }
    request.current?.abort();
    setLoading(false);
    setSelectedCatalog(null);
    setBooks([]);
    setFeedTitle('');
    setError(null);
  }, [catalogHistory, loadCatalog, invalidateImport]);

  const handleClose = useCallback(() => {
    invalidateImport();
    request.current?.abort();
    onClose();
    setLoading(false);
    setSelectedCatalog(null);
    setCatalogHistory([]);
    setBooks([]);
    setFeedTitle('');
    setError(null);
    setQuery('');
    setRssFeedUrl('');
  }, [onClose, invalidateImport]);

  return { loadCatalog, query, setQuery, rssFeedUrl, setRssFeedUrl, selectedCatalog, catalogHistory, books, feedTitle, loading, checkingSecurity, error, addingBookId, turnstileContainerRef, handleShowCatalog, handleBrowseCatalog, handleAddBook, handleLoadRssFeed, handleBack, handleClose };
}

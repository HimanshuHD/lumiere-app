import { useState } from 'react';
import type { Document } from '@/lib/supabase';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';

const FALLBACK_COVER_URL = '/lumiere-book-cover.svg?v=2';

export function DocumentCover({ document, className, alt = '' }: {
  document: Document;
  className?: string;
  alt?: string;
}) {
  const { url } = useDocumentStorageUrl(document.cover_storage_path, document.cover_url);
  const [failedUrl, setFailedUrl] = useState<string | null>(null);

  const showingFallback = !url || failedUrl === url;
  return (
    <img
      src={showingFallback ? FALLBACK_COVER_URL : url}
      alt={alt || (showingFallback
        ? `${document.title} cover unavailable; Lumiere default cover shown`
        : `${document.title} cover`)}
      className={className}
      style={{ opacity: showingFallback ? 0.72 : 1, objectPosition: 'center' }}
      onError={showingFallback ? undefined : () => setFailedUrl(url)}
    />
  );
}

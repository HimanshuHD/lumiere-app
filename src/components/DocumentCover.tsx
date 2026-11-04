import { useState } from 'react';
import type { Document } from '@/domain/documents';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';
import { useAuth } from '@/features/auth';
import { isDocumentLockedForUser } from '@/lib/documentAccess';

const FALLBACK_COVER_URL = '/lumiere-book-cover.svg?v=2';

export function DocumentCover({ document, className, alt = '' }: {
  document: Omit<Document, 'chapters'>;
  className?: string;
  alt?: string;
}) {
  const { user } = useAuth();
  const { url } = useDocumentStorageUrl(
    document.cover_storage_path,
    document.cover_url,
    !isDocumentLockedForUser(document, user?.id),
  );
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

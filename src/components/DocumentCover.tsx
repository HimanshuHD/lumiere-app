import type { Document } from '@/lib/supabase';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';

export function DocumentCover({ document, className, alt = '' }: {
  document: Document;
  className?: string;
  alt?: string;
}) {
  const { url } = useDocumentStorageUrl(document.cover_storage_path, document.cover_url);

  if (!url) {
    return <div className={className} role="img" aria-label={alt || `${document.title} cover unavailable`} />;
  }

  return <img src={url} alt={alt} className={className} />;
}

import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { Document } from '@/lib/supabase';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';

interface DocumentFileLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  document: Document;
  children: ReactNode;
}

export function DocumentFileLink({ document, children, ...anchorProps }: DocumentFileLinkProps) {
  const { url, error } = useDocumentStorageUrl(document.file_storage_path, document.file_url);
  if (!document.file_storage_path && !document.file_url) return null;

  return (
    <a
      {...anchorProps}
      href={url || undefined}
      aria-disabled={!url}
      title={anchorProps.title || error || (!url ? 'Preparing secure document access.' : undefined)}
      onClick={(event) => {
        if (!url) event.preventDefault();
        anchorProps.onClick?.(event);
      }}
    >
      {children}
    </a>
  );
}

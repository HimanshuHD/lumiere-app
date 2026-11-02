import type { AnchorHTMLAttributes, ReactNode } from 'react';
import type { Document } from '@/lib/supabase';
import { useDocumentStorageUrl } from '@/hooks/useDocumentStorageUrl';
import { useAuth } from '@/context/AuthContext';
import { isDocumentLockedForUser } from '@/lib/documentAccess';

interface DocumentFileLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  document: Document;
  children: ReactNode;
}

export function DocumentFileLink({ document, children, ...anchorProps }: DocumentFileLinkProps) {
  const { user } = useAuth();
  const locked = isDocumentLockedForUser(document, user?.id);
  const { url, error } = useDocumentStorageUrl(document.file_storage_path, document.file_url, !locked);
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

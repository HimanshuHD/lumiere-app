import type { Document } from '@/lib/supabase';

export function isDocumentLockedForUser(document: Pick<Document, 'origin' | 'visibility' | 'uploaded_by'>, userId: string | undefined): boolean {
  return document.origin === 'user_upload'
    && document.visibility === 'private'
    && Boolean(document.uploaded_by)
    && document.uploaded_by !== userId;
}

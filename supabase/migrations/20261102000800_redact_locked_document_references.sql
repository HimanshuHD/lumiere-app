-- Saved references must not grant SELECT on the underlying private content.
DROP POLICY IF EXISTS "select_documents" ON public.documents;
CREATE POLICY "select_documents" ON public.documents FOR SELECT
TO authenticated
USING (visibility = 'shared' OR uploaded_by = auth.uid());

-- Expose only the display fields needed by a locked entry. All omitted columns
-- (including chapters, summary, URLs, filenames and source paths) stay redacted.
CREATE OR REPLACE FUNCTION public.get_locked_user_upload_references()
RETURNS SETOF public.documents
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT (jsonb_populate_record(NULL::public.documents, jsonb_build_object(
    'id', document.id,
    'title', document.title,
    'author', document.author,
    'category', document.category,
    'reading_time', 0,
    'summary', '',
    'chapters', '[]'::jsonb,
    'is_featured', false,
    'created_at', document.created_at,
    'origin', 'user_upload',
    'visibility', 'private',
    'uploaded_by', document.uploaded_by,
    'file_format', document.file_format
  ))).*
  FROM public.documents AS document
  WHERE auth.uid() IS NOT NULL
    AND document.origin = 'user_upload'
    AND document.visibility = 'private'
    AND document.uploaded_by <> auth.uid()
    AND (
      EXISTS (SELECT 1 FROM public.bookmarks AS reference
        WHERE reference.document_id = document.id AND reference.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.reading_progress AS reference
        WHERE reference.document_id = document.id AND reference.user_id = auth.uid())
      OR EXISTS (SELECT 1 FROM public.reading_list AS reference
        WHERE reference.document_id = document.id AND reference.user_id = auth.uid())
    );
$$;

REVOKE ALL ON FUNCTION public.get_locked_user_upload_references() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_locked_user_upload_references() TO authenticated;

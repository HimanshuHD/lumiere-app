CREATE OR REPLACE FUNCTION public.can_attach_document_storage_paths(
  candidate_document_id uuid,
  candidate_file_path text,
  candidate_cover_path text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (
      candidate_file_path IS NULL
      OR (storage.foldername(candidate_file_path))[1] = auth.uid()::text
    )
    AND (
      candidate_cover_path IS NULL
      OR (storage.foldername(candidate_cover_path))[1] = auth.uid()::text
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents AS existing_document
      WHERE (
        existing_document.file_storage_path = candidate_file_path
        OR existing_document.cover_storage_path = candidate_file_path
        OR existing_document.file_storage_path = candidate_cover_path
        OR existing_document.cover_storage_path = candidate_cover_path
      )
        AND NOT (
          existing_document.id = candidate_document_id
          AND existing_document.origin = 'user_upload'
          AND existing_document.uploaded_by = auth.uid()
        )
    );
$$;

REVOKE ALL ON FUNCTION public.can_attach_document_storage_paths(uuid, text, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_attach_document_storage_paths(uuid, text, text)
  TO authenticated;

DROP POLICY IF EXISTS "insert_documents" ON public.documents;
CREATE POLICY "insert_documents" ON public.documents FOR INSERT
TO authenticated
WITH CHECK (
  origin = 'user_upload'
  AND uploaded_by = auth.uid()
  AND source_identity IS NULL
  AND public.can_attach_document_storage_paths(id, file_storage_path, cover_storage_path)
);

DROP POLICY IF EXISTS "update_documents" ON public.documents;
CREATE POLICY "update_documents" ON public.documents FOR UPDATE
TO authenticated
USING (origin = 'user_upload' AND uploaded_by = auth.uid())
WITH CHECK (
  origin = 'user_upload'
  AND uploaded_by = auth.uid()
  AND source_identity IS NULL
  AND public.can_attach_document_storage_paths(id, file_storage_path, cover_storage_path)
);

DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;
CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    public.can_cleanup_document_storage_object(name)
    OR EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE (document.file_storage_path = name OR document.cover_storage_path = name)
        AND document.origin = 'user_upload'
        AND document.uploaded_by = auth.uid()
    )
  )
);

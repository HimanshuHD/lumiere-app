CREATE OR REPLACE FUNCTION public.can_cleanup_document_storage_object(object_name text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT auth.uid() IS NOT NULL
    AND (storage.foldername(object_name))[1] = auth.uid()::text
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.file_storage_path = object_name
        OR document.cover_storage_path = object_name
    );
$$;

REVOKE ALL ON FUNCTION public.can_cleanup_document_storage_object(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_cleanup_document_storage_object(text) TO authenticated;

DROP POLICY IF EXISTS "documents_bucket_owner_cleanup_read" ON storage.objects;
CREATE POLICY "documents_bucket_owner_cleanup_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.can_cleanup_document_storage_object(name)
);

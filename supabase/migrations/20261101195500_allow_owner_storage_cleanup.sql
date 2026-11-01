DROP POLICY IF EXISTS "documents_bucket_owner_cleanup_read" ON storage.objects;
CREATE POLICY "documents_bucket_owner_cleanup_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND NOT EXISTS (
    SELECT 1
    FROM documents AS catalog_document
    WHERE (catalog_document.file_storage_path = name OR catalog_document.cover_storage_path = name)
      AND catalog_document.origin = 'catalog_import'
  )
  AND (
    NOT EXISTS (
      SELECT 1
      FROM documents AS document
      WHERE document.file_storage_path = name OR document.cover_storage_path = name
    )
    OR EXISTS (
      SELECT 1
      FROM documents AS document
      WHERE (document.file_storage_path = name OR document.cover_storage_path = name)
        AND document.origin = 'user_upload'
        AND document.uploaded_by = auth.uid()
    )
  )
);

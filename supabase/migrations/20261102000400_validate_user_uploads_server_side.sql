DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;

DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
CREATE POLICY "documents_bucket_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
  AND CASE
    WHEN metadata->>'size' ~ '^[0-9]+$' THEN
      CASE
        WHEN storage.filename(name) ~* '-cover\.(jpg|jpeg|png|webp|gif)$' THEN
          (metadata->>'size')::bigint BETWEEN 1 AND 5242880
          AND (
            (storage.filename(name) ~* '\.jpe?g$' AND metadata->>'mimetype' = 'image/jpeg')
            OR (storage.filename(name) ~* '\.png$' AND metadata->>'mimetype' = 'image/png')
            OR (storage.filename(name) ~* '\.webp$' AND metadata->>'mimetype' = 'image/webp')
            OR (storage.filename(name) ~* '\.gif$' AND metadata->>'mimetype' = 'image/gif')
          )
        ELSE
          (metadata->>'size')::bigint BETWEEN 1 AND 52428800
          AND (
            (storage.filename(name) ~* '\.pdf$' AND metadata->>'mimetype' = 'application/pdf')
            OR (storage.filename(name) ~* '\.txt$' AND metadata->>'mimetype' = 'text/plain')
            OR (storage.filename(name) ~* '\.epub$' AND metadata->>'mimetype' = 'application/epub+zip')
          )
      END
    ELSE false
  END
);

CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND public.can_cleanup_document_storage_object(name)
);

DROP POLICY IF EXISTS "insert_documents" ON public.documents;
DROP POLICY IF EXISTS "delete_documents" ON public.documents;

CREATE OR REPLACE FUNCTION public.prevent_user_upload_file_mutation()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog
AS $$
BEGIN
  IF current_user = 'authenticated'
    AND OLD.origin = 'user_upload'
    AND (
      NEW.file_storage_path IS DISTINCT FROM OLD.file_storage_path
      OR NEW.cover_storage_path IS DISTINCT FROM OLD.cover_storage_path
      OR NEW.file_format IS DISTINCT FROM OLD.file_format
      OR NEW.file_name IS DISTINCT FROM OLD.file_name
    ) THEN
    RAISE EXCEPTION 'Uploaded file references and validated format cannot be changed.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.prevent_user_upload_file_mutation() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS prevent_user_upload_file_mutation ON public.documents;
CREATE TRIGGER prevent_user_upload_file_mutation
  BEFORE UPDATE ON public.documents
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_user_upload_file_mutation();

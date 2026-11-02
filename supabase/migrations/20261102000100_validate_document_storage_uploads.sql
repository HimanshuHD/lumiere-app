UPDATE storage.buckets
SET file_size_limit = 52428800,
    allowed_mime_types = ARRAY[
      'application/pdf',
      'text/plain',
      'application/epub+zip',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif'
    ]
WHERE id = 'documents';

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

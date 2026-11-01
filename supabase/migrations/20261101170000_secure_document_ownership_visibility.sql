CREATE TABLE IF NOT EXISTS document_security_migration_audit (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  document_id uuid NOT NULL,
  canonical_document_id uuid,
  file_storage_path text,
  cover_storage_path text,
  legacy_file_url text,
  legacy_cover_url text,
  reason text NOT NULL,
  archived_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS origin text,
  ADD COLUMN IF NOT EXISTS visibility text,
  ADD COLUMN IF NOT EXISTS source_identity text,
  ADD COLUMN IF NOT EXISTS file_storage_path text,
  ADD COLUMN IF NOT EXISTS cover_storage_path text;

UPDATE documents
SET
  origin = CASE
    WHEN id IN (
      '4350bfc7-cd8c-4725-9d1b-9051c7a32866',
      '5f85fae3-360a-45d9-a9cb-513c302e079e',
      '77123519-4519-4883-9e24-b728caec341a',
      '54c48967-1e6d-4d4c-8e9c-3d231b20f29b',
      'e488bba3-8393-4b5b-8070-be2ac30da5ae',
      'c2c801f8-e2c7-4390-a592-db1900526a70',
      'b3bcd430-e854-45bf-86df-eb7251fb2d82',
      '666d33ce-a9a8-4d2c-9d63-483188180020',
      '06e6e69a-302a-4763-8cd6-47eae64b0dd9'
    ) THEN 'catalog_import'
    WHEN source_url IS NOT NULL THEN 'legacy_unowned'
    WHEN uploaded_by IS NOT NULL THEN 'user_upload'
    ELSE 'legacy_unowned'
  END,
  visibility = CASE
    WHEN id IN (
      '4350bfc7-cd8c-4725-9d1b-9051c7a32866',
      '5f85fae3-360a-45d9-a9cb-513c302e079e',
      '77123519-4519-4883-9e24-b728caec341a',
      '54c48967-1e6d-4d4c-8e9c-3d231b20f29b',
      'e488bba3-8393-4b5b-8070-be2ac30da5ae',
      'c2c801f8-e2c7-4390-a592-db1900526a70',
      'b3bcd430-e854-45bf-86df-eb7251fb2d82',
      '666d33ce-a9a8-4d2c-9d63-483188180020',
      '06e6e69a-302a-4763-8cd6-47eae64b0dd9'
    ) THEN 'shared'
    ELSE 'private'
  END,
  source_identity = CASE
    WHEN source_url ~* '/ebooks/[0-9]+' THEN
      'project-gutenberg:' || substring(lower(source_url) FROM '/ebooks/([0-9]+)')
    WHEN source_url ~* '/cache/epub/[0-9]+' THEN
      'project-gutenberg:' || substring(lower(source_url) FROM '/cache/epub/([0-9]+)')
    WHEN source_url IS NOT NULL THEN lower(
      trim(trailing '/' FROM split_part(split_part(source_url, '?', 1), '#', 1))
    )
    ELSE NULL
  END,
  file_storage_path = CASE
    WHEN file_url LIKE '%/storage/v1/object/public/documents/%'
      AND EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'documents'
          AND object.name = split_part(
            substr(
              file_url,
              strpos(file_url, '/storage/v1/object/public/documents/')
                + length('/storage/v1/object/public/documents/')
            ),
            '?',
            1
          )
      )
    THEN split_part(
      substr(
        file_url,
        strpos(file_url, '/storage/v1/object/public/documents/')
          + length('/storage/v1/object/public/documents/')
      ),
      '?',
      1
    )
    ELSE NULL
  END,
  cover_storage_path = CASE
    WHEN cover_url LIKE '%/storage/v1/object/public/documents/%'
      AND EXISTS (
        SELECT 1
        FROM storage.objects AS object
        WHERE object.bucket_id = 'documents'
          AND object.name = split_part(
            substr(
              cover_url,
              strpos(cover_url, '/storage/v1/object/public/documents/')
                + length('/storage/v1/object/public/documents/')
            ),
            '?',
            1
          )
      )
    THEN split_part(
      substr(
        cover_url,
        strpos(cover_url, '/storage/v1/object/public/documents/')
          + length('/storage/v1/object/public/documents/')
      ),
      '?',
      1
    )
    ELSE NULL
  END;

INSERT INTO document_security_migration_audit (
  document_id,
  legacy_cover_url,
  reason
)
SELECT
  document.id,
  document.cover_url,
  'Legacy cover URL points to a documents storage object that is absent from this project; restore the object or review the URL'
FROM documents AS document
WHERE document.cover_url LIKE '%/storage/v1/object/public/documents/%'
  AND NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'documents'
      AND object.name = split_part(
        substr(
          document.cover_url,
          strpos(document.cover_url, '/storage/v1/object/public/documents/')
            + length('/storage/v1/object/public/documents/')
        ),
        '?',
        1
      )
  );

INSERT INTO document_security_migration_audit (
  document_id,
  legacy_file_url,
  reason
)
SELECT
  id,
  file_url,
  'Legacy file URL could not be mapped to a documents storage object and must be reviewed before restoring access'
FROM documents
WHERE file_url IS NOT NULL
  AND file_storage_path IS NULL;

INSERT INTO document_security_migration_audit (
  document_id,
  file_storage_path,
  cover_storage_path,
  reason
)
SELECT
  document.id,
  document.file_storage_path,
  document.cover_storage_path,
  'A migrated document or cover path has no matching storage object and must be restored or reviewed'
FROM documents AS document
WHERE (document.file_storage_path IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'documents'
      AND object.name = document.file_storage_path
  ))
  OR (document.cover_storage_path IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM storage.objects AS object
    WHERE object.bucket_id = 'documents'
      AND object.name = document.cover_storage_path
  ));

UPDATE documents
SET
  uploaded_by = NULL,
  file_url = NULL,
  cover_url = CASE
    WHEN cover_storage_path IS NOT NULL THEN NULL
    WHEN origin = 'legacy_unowned'
      AND cover_url LIKE '%/storage/v1/object/public/documents/%' THEN NULL
    ELSE cover_url
  END
WHERE origin IN ('catalog_import', 'legacy_unowned');

UPDATE documents
SET
  file_url = NULL,
  cover_url = CASE
    WHEN cover_storage_path IS NOT NULL THEN NULL
    WHEN cover_url LIKE '%/storage/v1/object/public/documents/%' THEN NULL
    ELSE cover_url
  END
WHERE origin = 'user_upload';

CREATE TEMP TABLE duplicate_catalog_documents ON COMMIT DROP AS
SELECT
  id AS duplicate_id,
  first_value(id) OVER (
    PARTITION BY source_identity
    ORDER BY created_at NULLS LAST, id
  ) AS canonical_id
FROM documents
WHERE origin IN ('catalog_import', 'legacy_unowned')
  AND source_identity IS NOT NULL;

INSERT INTO document_security_migration_audit (
  document_id,
  canonical_document_id,
  file_storage_path,
  cover_storage_path,
  reason
)
SELECT
  duplicate.id,
  duplicate_map.canonical_id,
  duplicate.file_storage_path,
  duplicate.cover_storage_path,
  'Duplicate legacy catalog import merged into the canonical source record'
FROM duplicate_catalog_documents AS duplicate_map
JOIN documents AS duplicate ON duplicate.id = duplicate_map.duplicate_id
WHERE duplicate_map.duplicate_id <> duplicate_map.canonical_id;

INSERT INTO document_security_migration_audit (
  document_id,
  reason
)
SELECT
  id,
  'Legacy record has no trustworthy owner or source identity and was quarantined as private for administrator review'
FROM documents
WHERE origin = 'legacy_unowned';

INSERT INTO reading_progress (
  user_id,
  document_id,
  chapter_index,
  scroll_percent,
  updated_at,
  epub_cfi
)
SELECT DISTINCT ON (progress.user_id, duplicate_map.canonical_id)
  progress.user_id,
  duplicate_map.canonical_id,
  progress.chapter_index,
  progress.scroll_percent,
  progress.updated_at,
  progress.epub_cfi
FROM duplicate_catalog_documents AS duplicate_map
JOIN reading_progress AS progress ON progress.document_id = duplicate_map.duplicate_id
WHERE duplicate_map.duplicate_id <> duplicate_map.canonical_id
ORDER BY progress.user_id, duplicate_map.canonical_id, progress.updated_at DESC
ON CONFLICT (user_id, document_id) DO UPDATE
SET
  chapter_index = EXCLUDED.chapter_index,
  scroll_percent = EXCLUDED.scroll_percent,
  updated_at = EXCLUDED.updated_at,
  epub_cfi = EXCLUDED.epub_cfi
WHERE EXCLUDED.updated_at > reading_progress.updated_at;

DELETE FROM bookmarks AS duplicate
USING duplicate_catalog_documents AS duplicate_map, bookmarks AS canonical
WHERE duplicate.document_id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id
  AND canonical.document_id = duplicate_map.canonical_id
  AND canonical.user_id = duplicate.user_id;

DELETE FROM reading_list AS duplicate
USING duplicate_catalog_documents AS duplicate_map, reading_list AS canonical
WHERE duplicate.document_id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id
  AND canonical.document_id = duplicate_map.canonical_id
  AND canonical.user_id = duplicate.user_id;

UPDATE bookmarks AS personal
SET document_id = duplicate_map.canonical_id
FROM duplicate_catalog_documents AS duplicate_map
WHERE personal.document_id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id;

UPDATE reading_list AS personal
SET document_id = duplicate_map.canonical_id
FROM duplicate_catalog_documents AS duplicate_map
WHERE personal.document_id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id;

DELETE FROM reading_progress AS progress
USING duplicate_catalog_documents AS duplicate_map
WHERE progress.document_id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id;

DELETE FROM documents AS duplicate
USING duplicate_catalog_documents AS duplicate_map
WHERE duplicate.id = duplicate_map.duplicate_id
  AND duplicate_map.duplicate_id <> duplicate_map.canonical_id;

UPDATE documents
SET visibility = 'private'
WHERE origin = 'user_upload' AND visibility IS NULL;

UPDATE documents
SET visibility = 'shared'
WHERE origin = 'catalog_import' AND visibility IS NULL;

ALTER TABLE documents
  ALTER COLUMN origin SET DEFAULT 'user_upload',
  ALTER COLUMN origin SET NOT NULL,
  ALTER COLUMN visibility SET DEFAULT 'private',
  ALTER COLUMN visibility SET NOT NULL,
  ALTER COLUMN uploaded_by SET DEFAULT auth.uid();

ALTER TABLE documents
  ADD CONSTRAINT documents_origin_check
    CHECK (origin IN ('user_upload', 'catalog_import', 'legacy_unowned')),
  ADD CONSTRAINT documents_visibility_check
    CHECK (visibility IN ('private', 'shared')),
  ADD CONSTRAINT documents_catalog_visibility_check
    CHECK (origin <> 'catalog_import' OR visibility = 'shared'),
  ADD CONSTRAINT documents_origin_owner_check
    CHECK (
      (origin = 'user_upload' AND uploaded_by IS NOT NULL AND source_identity IS NULL)
      OR (origin = 'catalog_import' AND uploaded_by IS NULL)
      OR (
        origin = 'legacy_unowned'
        AND uploaded_by IS NULL
        AND visibility = 'private'
      )
    ),
  ADD CONSTRAINT documents_upload_paths_owner_check
    CHECK (
      origin IN ('catalog_import', 'legacy_unowned')
      OR (
        (file_storage_path IS NULL OR file_storage_path LIKE uploaded_by::text || '/%')
        AND (cover_storage_path IS NULL OR cover_storage_path LIKE uploaded_by::text || '/%')
      )
    );

CREATE UNIQUE INDEX documents_catalog_source_identity_idx
  ON documents (source_identity)
  WHERE origin = 'catalog_import' AND source_identity IS NOT NULL;

CREATE INDEX documents_visibility_owner_idx
  ON documents (visibility, uploaded_by);

DROP POLICY IF EXISTS "select_documents" ON documents;
CREATE POLICY "select_documents" ON documents FOR SELECT
TO authenticated
USING (visibility = 'shared' OR uploaded_by = auth.uid());

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
TO authenticated
WITH CHECK (
  origin = 'user_upload'
  AND uploaded_by = auth.uid()
  AND source_identity IS NULL
);

DROP POLICY IF EXISTS "update_documents" ON documents;
CREATE POLICY "update_documents" ON documents FOR UPDATE
TO authenticated
USING (origin = 'user_upload' AND uploaded_by = auth.uid())
WITH CHECK (
  origin = 'user_upload'
  AND uploaded_by = auth.uid()
  AND source_identity IS NULL
);

DROP POLICY IF EXISTS "delete_documents" ON documents;
CREATE POLICY "delete_documents" ON documents FOR DELETE
TO authenticated
USING (origin = 'user_upload' AND uploaded_by = auth.uid());

UPDATE storage.buckets
SET public = false
WHERE id = 'documents';

DROP POLICY IF EXISTS "documents_bucket_read" ON storage.objects;
CREATE POLICY "documents_bucket_read" ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE (document.file_storage_path = name OR document.cover_storage_path = name)
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
CREATE POLICY "documents_bucket_insert" ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
CREATE POLICY "documents_bucket_update" ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'documents'
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE (document.file_storage_path = name OR document.cover_storage_path = name)
      AND document.origin = 'user_upload'
      AND document.uploaded_by = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'documents'
  AND (storage.foldername(name))[1] = auth.uid()::text
);

DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;
CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'documents'
  AND (
    (
      (storage.foldername(name))[1] = auth.uid()::text
      AND NOT EXISTS (
        SELECT 1
        FROM documents AS catalog_document
        WHERE (catalog_document.file_storage_path = name OR catalog_document.cover_storage_path = name)
          AND catalog_document.origin = 'catalog_import'
      )
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

ALTER TABLE document_security_migration_audit ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "insert_own_bookmarks" ON bookmarks;
CREATE POLICY "insert_own_bookmarks" ON bookmarks FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "update_own_bookmarks" ON bookmarks;
CREATE POLICY "update_own_bookmarks" ON bookmarks FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "insert_own_progress" ON reading_progress;
CREATE POLICY "insert_own_progress" ON reading_progress FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "update_own_progress" ON reading_progress;
CREATE POLICY "update_own_progress" ON reading_progress FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "insert_own_reading_list" ON reading_list;
CREATE POLICY "insert_own_reading_list" ON reading_list FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

DROP POLICY IF EXISTS "update_own_reading_list" ON reading_list;
CREATE POLICY "update_own_reading_list" ON reading_list FOR UPDATE
TO authenticated
USING (auth.uid() = user_id)
WITH CHECK (
  auth.uid() = user_id
  AND EXISTS (
    SELECT 1
    FROM documents AS document
    WHERE document.id = document_id
      AND (document.visibility = 'shared' OR document.uploaded_by = auth.uid())
  )
);

-- Demo stories are ownerless shared text, distinct from real catalog imports.
-- Existing document RLS permits authenticated reads of shared rows and restricts
-- ordinary document mutations to the user's own user_upload rows. Keep it intact.
ALTER TABLE public.documents
  DROP CONSTRAINT documents_origin_check,
  DROP CONSTRAINT documents_origin_owner_check,
  ADD CONSTRAINT documents_origin_check
    CHECK (origin IN ('user_upload', 'catalog_import', 'legacy_unowned', 'demo')),
  ADD CONSTRAINT documents_origin_owner_check CHECK (
    (origin = 'user_upload' AND uploaded_by IS NOT NULL AND source_identity IS NULL)
    OR (origin = 'catalog_import' AND uploaded_by IS NULL)
    OR (origin = 'legacy_unowned' AND uploaded_by IS NULL AND visibility = 'private')
    OR (origin = 'demo' AND uploaded_by IS NULL AND source_identity IS NULL)
  ),
  ADD CONSTRAINT documents_demo_content_check CHECK (
    origin <> 'demo' OR (
      visibility = 'shared' AND file_format IS NOT DISTINCT FROM 'txt'
      AND source_identity IS NULL AND source_url IS NULL
      AND file_url IS NULL AND file_storage_path IS NULL AND cover_storage_path IS NULL
      AND CASE WHEN jsonb_typeof(chapters) = 'array' THEN jsonb_array_length(chapters) > 0 ELSE false END
    )
  );

-- Verified generated-story IDs only. The ninth historical ID belongs to an
-- uploaded PDF and is deliberately excluded. Do not insert missing stories here:
-- loading demo content is an explicit deployment decision (see seeds/demo.sql).
UPDATE public.documents
SET origin = 'demo', visibility = 'shared', file_format = 'txt'
WHERE id IN (
  '4350bfc7-cd8c-4725-9d1b-9051c7a32866',
  '5f85fae3-360a-45d9-a9cb-513c302e079e',
  '77123519-4519-4883-9e24-b728caec341a',
  '54c48967-1e6d-4d4c-8e9c-3d231b20f29b',
  'e488bba3-8393-4b5b-8070-be2ac30da5ae',
  'c2c801f8-e2c7-4390-a592-db1900526a70',
  'b3bcd430-e854-45bf-86df-eb7251fb2d82',
  '666d33ce-a9a8-4d2c-9d63-483188180020'
)
  AND origin IN ('catalog_import', 'legacy_unowned')
  AND uploaded_by IS NULL AND source_identity IS NULL AND source_url IS NULL
  AND file_url IS NULL AND file_storage_path IS NULL AND cover_storage_path IS NULL
  AND (file_format IS NULL OR file_format = 'txt')
  AND CASE WHEN jsonb_typeof(chapters) = 'array' THEN jsonb_array_length(chapters) > 0 ELSE false END;

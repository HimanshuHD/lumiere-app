ALTER TABLE documents ADD COLUMN IF NOT EXISTS source_url text;

CREATE UNIQUE INDEX IF NOT EXISTS documents_uploaded_source_url_idx
  ON documents (uploaded_by, source_url)
  WHERE uploaded_by IS NOT NULL AND source_url IS NOT NULL;

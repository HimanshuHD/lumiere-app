CREATE TABLE public.document_library_memberships (
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, document_id)
);

CREATE INDEX document_library_memberships_document_id_idx
  ON public.document_library_memberships (document_id);

ALTER TABLE public.document_library_memberships ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.document_library_memberships FROM PUBLIC, anon;
GRANT SELECT, INSERT, DELETE ON public.document_library_memberships TO authenticated;

CREATE POLICY "select_own_document_library_memberships"
  ON public.document_library_memberships FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "insert_own_catalog_library_memberships"
  ON public.document_library_memberships FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.documents AS document
      WHERE document.id = document_id
        AND document.origin = 'catalog_import'
        AND document.visibility = 'shared'
    )
  );

CREATE POLICY "delete_own_document_library_memberships"
  ON public.document_library_memberships FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

UPDATE public.documents AS document
SET source_identity = CASE
  WHEN document.source_identity ~ '^project-gutenberg:[0-9]+$'
    THEN document.source_identity
      || ':'
      || lower(coalesce(document.file_format, 'unknown'))
      || ':'
      || regexp_replace(
        regexp_replace(lower(document.source_url), '^https?://[^/]+', ''),
        '[?#].*$',
        ''
      )
  ELSE document.source_identity
END
WHERE document.origin = 'catalog_import'
  AND document.source_identity ~ '^project-gutenberg:[0-9]+$'
  AND document.source_url IS NOT NULL;

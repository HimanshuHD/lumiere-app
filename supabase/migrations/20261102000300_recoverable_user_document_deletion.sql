ALTER TABLE public.document_lifecycle_recovery
  DROP CONSTRAINT document_lifecycle_recovery_failure_stage_check,
  ADD CONSTRAINT document_lifecycle_recovery_failure_stage_check CHECK (
    failure_stage IN (
      'document-lookup',
      'document-upload',
      'cover-upload',
      'document-insert',
      'reconciliation',
      'document-delete'
    )
  );

DROP POLICY IF EXISTS "select_documents" ON public.documents;
CREATE POLICY "select_documents" ON public.documents FOR SELECT
TO authenticated
USING (
  visibility = 'shared'
  OR uploaded_by = auth.uid()
  OR (
    origin = 'user_upload'
    AND (
      EXISTS (
        SELECT 1
        FROM public.bookmarks AS bookmark
        WHERE bookmark.document_id = documents.id
          AND bookmark.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.reading_progress AS progress
        WHERE progress.document_id = documents.id
          AND progress.user_id = auth.uid()
      )
      OR EXISTS (
        SELECT 1
        FROM public.reading_list AS list_item
        WHERE list_item.document_id = documents.id
          AND list_item.user_id = auth.uid()
      )
    )
  )
);

CREATE OR REPLACE FUNCTION public.get_user_upload_deletion_impact(p_document_id uuid)
RETURNS TABLE (
  title text,
  bookmark_users bigint,
  reading_users bigint,
  reading_list_users bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.id = p_document_id
      AND document.origin = 'user_upload'
      AND document.uploaded_by = auth.uid()
  ) THEN
    RAISE EXCEPTION 'Document not found or not owned by the current user.'
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    document.title,
    (SELECT count(DISTINCT bookmark.user_id)
      FROM public.bookmarks AS bookmark
      WHERE bookmark.document_id = document.id),
    (SELECT count(DISTINCT progress.user_id)
      FROM public.reading_progress AS progress
      WHERE progress.document_id = document.id),
    (SELECT count(DISTINCT list_item.user_id)
      FROM public.reading_list AS list_item
      WHERE list_item.document_id = document.id)
  FROM public.documents AS document
  WHERE document.id = p_document_id;
END;
$$;

REVOKE ALL ON FUNCTION public.get_user_upload_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_user_upload_deletion_impact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_owned_user_upload(p_document_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
DECLARE
  document_row public.documents%ROWTYPE;
  bookmark_count bigint;
  reading_count bigint;
  reading_list_count bigint;
BEGIN
  SELECT *
  INTO document_row
  FROM public.documents AS document
  WHERE document.id = p_document_id
    AND document.origin = 'user_upload'
    AND document.uploaded_by = auth.uid()
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Document not found or not owned by the current user.'
      USING ERRCODE = '42501';
  END IF;

  SELECT count(DISTINCT bookmark.user_id)
  INTO bookmark_count
  FROM public.bookmarks AS bookmark
  WHERE bookmark.document_id = p_document_id;

  SELECT count(DISTINCT progress.user_id)
  INTO reading_count
  FROM public.reading_progress AS progress
  WHERE progress.document_id = p_document_id;

  SELECT count(DISTINCT list_item.user_id)
  INTO reading_list_count
  FROM public.reading_list AS list_item
  WHERE list_item.document_id = p_document_id;

  INSERT INTO public.document_lifecycle_recovery (
    user_id,
    operation_id,
    storage_path,
    failure_stage,
    status,
    last_error
  )
  SELECT
    auth.uid(),
    p_document_id,
    storage_path,
    'document-delete',
    'cleanup_pending',
    'Document deleted; storage cleanup is pending.'
  FROM unnest(ARRAY[document_row.file_storage_path, document_row.cover_storage_path]) AS paths(storage_path)
  WHERE storage_path IS NOT NULL
  ON CONFLICT (user_id, operation_id, storage_path) DO UPDATE
  SET failure_stage = 'document-delete',
      status = 'cleanup_pending',
      last_error = EXCLUDED.last_error,
      updated_at = now();

  DELETE FROM public.documents AS document
  WHERE document.id = p_document_id;

  RETURN jsonb_build_object(
    'document_id', p_document_id,
    'title', document_row.title,
    'bookmark_users', bookmark_count,
    'reading_users', reading_count,
    'reading_list_users', reading_list_count,
    'storage_paths', to_jsonb(
      array_remove(ARRAY[document_row.file_storage_path, document_row.cover_storage_path], NULL)
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_owned_user_upload(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_owned_user_upload(uuid) TO authenticated;

ALTER TABLE public.document_lifecycle_recovery
  DROP CONSTRAINT document_lifecycle_recovery_failure_stage_check,
  ADD CONSTRAINT document_lifecycle_recovery_failure_stage_check CHECK (
    failure_stage IN (
      'document-lookup',
      'document-upload',
      'cover-upload',
      'document-insert',
      'reconciliation',
      'document-delete',
      'catalog-delete'
    )
  );

ALTER TABLE public.document_lifecycle_recovery
  DROP CONSTRAINT document_lifecycle_recovery_owner_path_check,
  ADD CONSTRAINT document_lifecycle_recovery_owner_path_check CHECK (
    (
      failure_stage = 'catalog-delete'
      AND storage_path <> ''
      AND storage_path !~ '(^/|/$|//|(^|/)(\.|\.\.)(/|$))'
    )
    OR (
      failure_stage <> 'catalog-delete'
      AND storage_path ~ ('^' || user_id::text || '/[^/].*$')
      AND storage_path !~ '(^|/)(\.|\.\.)(/|$)'
    )
  );

DROP POLICY IF EXISTS "insert_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery;
CREATE POLICY "insert_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND failure_stage <> 'catalog-delete'
  );

DROP POLICY IF EXISTS "update_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery;
CREATE POLICY "update_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND failure_stage <> 'catalog-delete'
  )
  WITH CHECK (
    user_id = auth.uid()
    AND failure_stage <> 'catalog-delete'
  );

CREATE OR REPLACE FUNCTION public.is_catalog_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog
AS $$
  SELECT coalesce((
    SELECT user_record.raw_app_meta_data->>'role' = 'admin'
    FROM auth.users AS user_record
    WHERE user_record.id = auth.uid()
  ), false);
$$;

REVOKE ALL ON FUNCTION public.is_catalog_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_catalog_admin() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_catalog_document_deletion_impact(p_document_id uuid)
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
  IF NOT public.is_catalog_admin() THEN
    RAISE EXCEPTION 'Catalog administrator access is required.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.documents AS document
    WHERE document.id = p_document_id
      AND document.origin = 'catalog_import'
      AND document.visibility = 'shared'
  ) THEN
    RAISE EXCEPTION 'Canonical catalog document not found.'
      USING ERRCODE = 'P0002';
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

REVOKE ALL ON FUNCTION public.get_catalog_document_deletion_impact(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_catalog_document_deletion_impact(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_canonical_catalog_document(p_document_id uuid)
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
  storage_paths text[];
BEGIN
  IF NOT public.is_catalog_admin() THEN
    RAISE EXCEPTION 'Catalog administrator access is required.'
      USING ERRCODE = '42501';
  END IF;

  SELECT *
  INTO document_row
  FROM public.documents AS document
  WHERE document.id = p_document_id
    AND document.origin = 'catalog_import'
    AND document.visibility = 'shared'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Canonical catalog document not found.'
      USING ERRCODE = 'P0002';
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

  SELECT coalesce(array_agg(DISTINCT candidate.storage_path), ARRAY[]::text[])
  INTO storage_paths
  FROM unnest(ARRAY[document_row.file_storage_path, document_row.cover_storage_path])
    AS candidate(storage_path)
  WHERE candidate.storage_path IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM public.documents AS other_document
      WHERE other_document.id <> p_document_id
        AND (
          other_document.file_storage_path = candidate.storage_path
          OR other_document.cover_storage_path = candidate.storage_path
        )
    );

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
    'catalog-delete',
    'cleanup_pending',
    'Canonical catalog document deleted; storage cleanup is pending.'
  FROM unnest(storage_paths) AS paths(storage_path)
  ON CONFLICT (user_id, operation_id, storage_path) DO UPDATE
  SET failure_stage = 'catalog-delete',
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
    'storage_paths', to_jsonb(storage_paths)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.delete_canonical_catalog_document(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.delete_canonical_catalog_document(uuid) TO authenticated;

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
      'catalog-delete',
      'catalog-import'
    )
  );

ALTER TABLE public.document_lifecycle_recovery
  DROP CONSTRAINT document_lifecycle_recovery_owner_path_check,
  ADD CONSTRAINT document_lifecycle_recovery_owner_path_check CHECK (
    (
      failure_stage IN ('catalog-delete', 'catalog-import')
      AND storage_path <> ''
      AND storage_path !~ '(^/|/$|//|(^|/)(\.|\.\.)(/|$))'
    )
    OR (
      failure_stage NOT IN ('catalog-delete', 'catalog-import')
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
    AND failure_stage NOT IN ('catalog-delete', 'catalog-import')
  );

DROP POLICY IF EXISTS "update_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery;
CREATE POLICY "update_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR UPDATE
  TO authenticated
  USING (
    user_id = auth.uid()
    AND failure_stage NOT IN ('catalog-delete', 'catalog-import')
  )
  WITH CHECK (
    user_id = auth.uid()
    AND failure_stage NOT IN ('catalog-delete', 'catalog-import')
  );

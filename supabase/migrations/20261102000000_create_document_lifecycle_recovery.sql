CREATE TABLE public.document_lifecycle_recovery (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  operation_id uuid NOT NULL,
  storage_path text NOT NULL,
  failure_stage text NOT NULL CHECK (
    failure_stage IN (
      'document-lookup',
      'document-upload',
      'cover-upload',
      'document-insert',
      'reconciliation'
    )
  ),
  status text NOT NULL CHECK (status IN ('cleanup_pending', 'reconciliation_pending', 'completed')),
  last_error text,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, operation_id, storage_path),
  CONSTRAINT document_lifecycle_recovery_owner_path_check CHECK (
    storage_path ~ ('^' || user_id::text || '/[^/].*$')
    AND storage_path !~ '(^|/)(\.|\.\.)(/|$)'
  )
);

CREATE INDEX document_lifecycle_recovery_pending_idx
  ON public.document_lifecycle_recovery (user_id, created_at)
  WHERE status <> 'completed';

ALTER TABLE public.document_lifecycle_recovery ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.document_lifecycle_recovery FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON public.document_lifecycle_recovery TO authenticated;

CREATE POLICY "select_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "insert_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR INSERT
  TO authenticated
  WITH CHECK (user_id = auth.uid());

CREATE POLICY "update_own_document_lifecycle_recovery"
  ON public.document_lifecycle_recovery FOR UPDATE
  TO authenticated
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

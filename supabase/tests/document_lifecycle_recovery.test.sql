BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
VALUES
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'recovery-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '41000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'recovery-reader@example.test',
    '',
    now(),
    now(),
    now()
  );

SELECT ok(
  NOT has_table_privilege('anon', 'public.document_lifecycle_recovery', 'SELECT'),
  'anonymous clients cannot read upload recovery records'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);

INSERT INTO public.document_lifecycle_recovery (
  user_id,
  operation_id,
  storage_path,
  failure_stage,
  status,
  last_error
)
VALUES (
  '41000000-0000-0000-0000-000000000001',
  '42000000-0000-0000-0000-000000000001',
  '41000000-0000-0000-0000-000000000001/failed-upload.pdf',
  'document-insert',
  'cleanup_pending',
  'Storage cleanup failed.'
);

SELECT is(
  (SELECT count(*)::integer FROM public.document_lifecycle_recovery),
  1,
  'an owner can create a recovery record for their own storage path'
);

SELECT throws_ok(
  $$INSERT INTO public.document_lifecycle_recovery (
    user_id, operation_id, storage_path, failure_stage, status
  ) VALUES (
    '41000000-0000-0000-0000-000000000002',
    '42000000-0000-0000-0000-000000000002',
    '41000000-0000-0000-0000-000000000001/other-user.pdf',
    'document-upload',
    'cleanup_pending'
  )$$,
  '42501',
  NULL,
  'an owner cannot create another user’s recovery record'
);

SELECT throws_ok(
  $$INSERT INTO public.document_lifecycle_recovery (
    user_id, operation_id, storage_path, failure_stage, status
  ) VALUES (
    '41000000-0000-0000-0000-000000000001',
    '42000000-0000-0000-0000-000000000003',
    '41000000-0000-0000-0000-000000000001/../protected.pdf',
    'document-upload',
    'cleanup_pending'
  )$$,
  '23514',
  NULL,
  'recovery paths cannot traverse outside the owner storage folder'
);

SELECT set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.document_lifecycle_recovery),
  0,
  'another user cannot read recovery records'
);
UPDATE public.document_lifecycle_recovery
SET status = 'completed'
WHERE operation_id = '42000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT status FROM public.document_lifecycle_recovery
    WHERE operation_id = '42000000-0000-0000-0000-000000000001'),
  NULL::text,
  'another user cannot update recovery records'
);

SELECT set_config('request.jwt.claim.sub', '41000000-0000-0000-0000-000000000001', true);
UPDATE public.document_lifecycle_recovery
SET status = 'completed',
    last_error = NULL
WHERE operation_id = '42000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT status FROM public.document_lifecycle_recovery
    WHERE operation_id = '42000000-0000-0000-0000-000000000001'),
  'completed',
  'the owner can mark their recovery record complete'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

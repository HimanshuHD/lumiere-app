BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(20);

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
    '61000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'catalog-admin@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'catalog-reader-one@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '61000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'catalog-reader-two@example.test',
    '',
    now(),
    now(),
    now()
  );

UPDATE auth.users
SET raw_app_meta_data = '{"role":"admin"}'::jsonb
WHERE id = '61000000-0000-0000-0000-000000000001';

INSERT INTO public.documents (
  id,
  title,
  author,
  category,
  uploaded_by,
  origin,
  visibility,
  file_storage_path,
  cover_storage_path,
  source_identity
)
VALUES
  (
    '62000000-0000-0000-0000-000000000001',
    'Canonical catalog fixture',
    'Test Author',
    'Fiction',
    NULL,
    'catalog_import',
    'shared',
    'catalog/fixture/canonical.epub',
    'catalog/fixture/canonical-cover.jpg',
    'fixture:canonical:epub'
  ),
  (
    '62000000-0000-0000-0000-000000000002',
    'Owner upload fixture',
    'Test Author',
    'Fiction',
    '61000000-0000-0000-0000-000000000002',
    'user_upload',
    'shared',
    NULL,
    NULL,
    NULL
  ),
  (
    '62000000-0000-0000-0000-000000000003',
    'Shared path delete fixture',
    'Test Author',
    'Fiction',
    NULL,
    'catalog_import',
    'shared',
    'catalog/shared/reused.epub',
    NULL,
    'fixture:shared-delete:epub'
  ),
  (
    '62000000-0000-0000-0000-000000000004',
    'Shared path survivor fixture',
    'Test Author',
    'Fiction',
    NULL,
    'catalog_import',
    'shared',
    'catalog/shared/reused.epub',
    NULL,
    'fixture:shared-survivor:epub'
  );

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES
  (
    'documents',
    'catalog/fixture/canonical.epub',
    '61000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/epub+zip","size":100}'
  ),
  (
    'documents',
    'catalog/fixture/canonical-cover.jpg',
    '61000000-0000-0000-0000-000000000001',
    '{"mimetype":"image/jpeg","size":100}'
  ),
  (
    'documents',
    'catalog/shared/reused.epub',
    '61000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/epub+zip","size":100}'
  );

INSERT INTO public.bookmarks (id, user_id, document_id)
VALUES
  ('63000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001'),
  ('63000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001');

INSERT INTO public.reading_progress (id, user_id, document_id)
VALUES (
  '64000000-0000-0000-0000-000000000001',
  '61000000-0000-0000-0000-000000000002',
  '62000000-0000-0000-0000-000000000001'
);

INSERT INTO public.reading_list (id, user_id, document_id)
VALUES
  ('65000000-0000-0000-0000-000000000001', '61000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001'),
  ('65000000-0000-0000-0000-000000000002', '61000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001');

INSERT INTO public.document_library_memberships (user_id, document_id)
VALUES
  ('61000000-0000-0000-0000-000000000002', '62000000-0000-0000-0000-000000000001'),
  ('61000000-0000-0000-0000-000000000003', '62000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000002', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000002","role":"authenticated","app_metadata":{"role":"admin"},"user_metadata":{"role":"admin"}}',
  true
);

SELECT ok(
  NOT public.is_catalog_admin(),
  'client-held metadata cannot grant catalog administrator access'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_catalog_document_deletion_impact('62000000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'ordinary users cannot inspect global catalog deletion impact'
);
SELECT throws_ok(
  $$SELECT public.delete_canonical_catalog_document('62000000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'ordinary users cannot globally delete canonical catalog documents'
);
SELECT throws_ok(
  $$INSERT INTO public.document_lifecycle_recovery (
      user_id, operation_id, storage_path, failure_stage, status
    ) VALUES (
      '61000000-0000-0000-0000-000000000002',
      '66000000-0000-0000-0000-000000000001',
      'catalog/forged-file.epub',
      'catalog-delete',
      'cleanup_pending'
    )$$,
  '42501',
  NULL,
  'ordinary users cannot forge privileged catalog cleanup records'
);
SELECT throws_ok(
  $$INSERT INTO public.document_lifecycle_recovery (
      user_id, operation_id, storage_path, failure_stage, status
    ) VALUES (
      '61000000-0000-0000-0000-000000000002',
      '66000000-0000-0000-0000-000000000002',
      'catalog/forged-import.epub',
      'catalog-import',
      'cleanup_pending'
    )$$,
  '42501',
  NULL,
  'ordinary users cannot forge privileged catalog import recovery records'
);
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '62000000-0000-0000-0000-000000000001'),
  1,
  'rejected global deletion leaves the catalog document intact'
);

SELECT set_config('request.jwt.claim.sub', '61000000-0000-0000-0000-000000000001', true);
SELECT set_config(
  'request.jwt.claims',
  '{"sub":"61000000-0000-0000-0000-000000000001","role":"authenticated","app_metadata":{}}',
  true
);

SELECT ok(
  public.is_catalog_admin(),
  'the trusted app_metadata role grants the catalog-admin capability'
);
SELECT is(
  (SELECT bookmark_users FROM public.get_catalog_document_deletion_impact('62000000-0000-0000-0000-000000000001')),
  2::bigint,
  'deletion preview counts distinct bookmark users'
);
SELECT is(
  (SELECT reading_users FROM public.get_catalog_document_deletion_impact('62000000-0000-0000-0000-000000000001')),
  1::bigint,
  'deletion preview counts distinct readers'
);
SELECT is(
  (SELECT reading_list_users FROM public.get_catalog_document_deletion_impact('62000000-0000-0000-0000-000000000001')),
  2::bigint,
  'deletion preview counts distinct Read Later users'
);
SELECT throws_ok(
  $$SELECT public.delete_canonical_catalog_document('62000000-0000-0000-0000-000000000002')$$,
  'P0002',
  NULL,
  'catalog administrators cannot use global deletion on user uploads'
);
SELECT is(
  has_function_privilege(
    'anon',
    'public.delete_canonical_catalog_document(uuid)',
    'EXECUTE'
  ),
  false,
  'anonymous users cannot execute the global deletion function'
);
CREATE TEMP TABLE catalog_deletion_result AS
SELECT public.delete_canonical_catalog_document('62000000-0000-0000-0000-000000000001') AS result;
SELECT is(
  (SELECT result->>'title' FROM catalog_deletion_result),
  'Canonical catalog fixture',
  'global deletion returns the canonical document title'
);
SELECT is(
  (SELECT jsonb_array_length(result->'storage_paths') FROM catalog_deletion_result),
  2,
  'global deletion returns both file and cover paths for cleanup'
);
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '62000000-0000-0000-0000-000000000001'),
  0,
  'global deletion removes the canonical catalog record'
);
SELECT is(
  (SELECT count(*)::integer FROM public.bookmarks WHERE document_id = '62000000-0000-0000-0000-000000000001')
    + (SELECT count(*)::integer FROM public.reading_progress WHERE document_id = '62000000-0000-0000-0000-000000000001')
    + (SELECT count(*)::integer FROM public.reading_list WHERE document_id = '62000000-0000-0000-0000-000000000001')
    + (SELECT count(*)::integer FROM public.document_library_memberships WHERE document_id = '62000000-0000-0000-0000-000000000001'),
  0,
  'global deletion cascades all user references and memberships'
);
SELECT is(
  (SELECT count(*)::integer FROM public.document_lifecycle_recovery
    WHERE operation_id = '62000000-0000-0000-0000-000000000001'
      AND failure_stage = 'catalog-delete'
      AND status = 'cleanup_pending'),
  2,
  'global deletion queues both catalog storage objects for recoverable cleanup'
);
SELECT is(
  has_function_privilege(
    'authenticated',
    'public.delete_canonical_catalog_document(uuid)',
    'EXECUTE'
  ),
  true,
  'authenticated callers can invoke the function whose body enforces admin authorization'
);
CREATE TEMP TABLE shared_catalog_deletion_result AS
SELECT public.delete_canonical_catalog_document('62000000-0000-0000-0000-000000000003') AS result;
SELECT is(
  (SELECT jsonb_array_length(result->'storage_paths') FROM shared_catalog_deletion_result),
  0,
  'global deletion leaves a file queued for cleanup when another document references it'
);
SELECT is(
  (SELECT file_storage_path FROM public.documents
    WHERE id = '62000000-0000-0000-0000-000000000004'),
  'catalog/shared/reused.epub',
  'a shared storage path remains attached to its surviving catalog document'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

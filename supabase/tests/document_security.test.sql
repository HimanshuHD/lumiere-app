BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(17);

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
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'document-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '10000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'document-reader@example.test',
    '',
    now(),
    now(),
    now()
  );

INSERT INTO public.documents (
  id,
  title,
  author,
  category,
  uploaded_by,
  origin,
  visibility,
  source_identity
)
VALUES
  (
    '20000000-0000-0000-0000-000000000001',
    'Private fixture',
    'Test Author',
    'Fiction',
    '10000000-0000-0000-0000-000000000001',
    'user_upload',
    'private',
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'Shared fixture',
    'Test Author',
    'Fiction',
    '10000000-0000-0000-0000-000000000001',
    'user_upload',
    'shared',
    NULL
  ),
  (
    '20000000-0000-0000-0000-000000000003',
    'Catalog fixture',
    'Test Author',
    'Fiction',
    NULL,
    'catalog_import',
    'shared',
    'https://gutenberg.org/ebooks/3.epub'
  ),
  (
    '20000000-0000-0000-0000-000000000004',
    'Quarantined legacy fixture',
    'Test Author',
    'Fiction',
    NULL,
    'legacy_unowned',
    'private',
    'project-gutenberg:4'
  );

SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'documents_bucket_read'
      AND 'authenticated' = ANY(roles)
      AND NOT ('anon' = ANY(roles))
  ),
  'document storage reads require an authenticated role'
);
SELECT is(
  (SELECT public FROM storage.buckets WHERE id = 'documents'),
  false,
  'the document storage bucket is private'
);

SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000003', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents),
  0,
  'anonymous users cannot read document metadata'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000001'),
  0,
  'another user cannot read a private document'
);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000004'),
  0,
  'an unresolved legacy document is quarantined from regular users'
);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000002'),
  1,
  'another signed-in user can read a shared upload'
);
UPDATE public.documents
SET title = 'forged title'
WHERE id = '20000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT title FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000002'),
  'Shared fixture',
  'another user cannot mutate a shared upload'
);
SELECT throws_ok(
  $$INSERT INTO public.documents (title, author, category, uploaded_by, origin, visibility)
    VALUES ('Forged owner', 'Test Author', 'Fiction',
      '10000000-0000-0000-0000-000000000001', 'user_upload', 'shared')$$,
  '42501',
  NULL,
  'a client cannot impersonate another uploader'
);
SELECT throws_ok(
  $$INSERT INTO public.documents (title, author, category, uploaded_by, origin, visibility, source_identity)
    VALUES ('Forged catalog', 'Test Author', 'Fiction',
      NULL, 'catalog_import', 'shared', 'https://gutenberg.org/forged')$$,
  '42501',
  NULL,
  'ordinary clients cannot create catalog records'
);
SELECT throws_ok(
  $$INSERT INTO public.bookmarks (user_id, document_id)
    VALUES ('10000000-0000-0000-0000-000000000002',
      '20000000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'a user cannot add an inaccessible private document to a collection'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000001'),
  1,
  'the owner can read a private document'
);
SELECT throws_ok(
  $$UPDATE public.documents
    SET uploaded_by = '10000000-0000-0000-0000-000000000002'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'an owner cannot transfer document ownership'
);
SELECT throws_ok(
  $$UPDATE public.documents
    SET origin = 'catalog_import', uploaded_by = NULL, source_identity = 'forged-source'
    WHERE id = '20000000-0000-0000-0000-000000000001'$$,
  '42501',
  NULL,
  'an owner cannot turn an upload into a catalog record'
);
SELECT lives_ok(
  $$INSERT INTO public.bookmarks (user_id, document_id)
    VALUES ('10000000-0000-0000-0000-000000000001',
      '20000000-0000-0000-0000-000000000001')$$,
  'the owner can add a private document to a personal collection'
);
UPDATE public.documents
SET visibility = 'shared'
WHERE id = '20000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT visibility FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000001'),
  'shared',
  'the owner can make an upload shared'
);
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000001'),
  1,
  'a signed-in user can read an upload after it is shared'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
UPDATE public.documents
SET visibility = 'private'
WHERE id = '20000000-0000-0000-0000-000000000001';
SELECT set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents WHERE id = '20000000-0000-0000-0000-000000000001'),
  0,
  'changing an upload back to private blocks new reads'
);

SELECT * FROM finish();
ROLLBACK;

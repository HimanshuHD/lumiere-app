BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

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
    '44000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'collection-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    '44000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'collection-reader@example.test',
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
  source_identity,
  file_format,
  source_url
)
VALUES
  (
    '45000000-0000-0000-0000-000000000001',
    'Catalog fixture',
    'Test Author',
    'Fiction',
    NULL,
    'catalog_import',
    'shared',
    'project-gutenberg:1234:epub:/cache/epub/1234/pg1234-images.epub',
    'epub',
    'https://www.gutenberg.org/cache/epub/1234/pg1234-images.epub'
  ),
  (
    '45000000-0000-0000-0000-000000000002',
    'Private upload fixture',
    'Test Author',
    'Fiction',
    '44000000-0000-0000-0000-000000000001',
    'user_upload',
    'private',
    NULL,
    'pdf',
    NULL
  );

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000001', true);

INSERT INTO public.document_library_memberships (document_id)
VALUES ('45000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, document_id) DO NOTHING;
INSERT INTO public.document_library_memberships (document_id)
VALUES ('45000000-0000-0000-0000-000000000001')
ON CONFLICT (user_id, document_id) DO NOTHING;
SELECT is(
  (SELECT count(*)::integer FROM public.document_library_memberships),
  1,
  'repeated adds create only one personal membership'
);

SELECT throws_ok(
  $$INSERT INTO public.document_library_memberships (document_id)
    VALUES ('45000000-0000-0000-0000-000000000002')$$,
  '42501',
  NULL,
  'only canonical shared catalog documents can be added'
);

SELECT set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000002', true);
SELECT is(
  (SELECT count(*)::integer FROM public.document_library_memberships),
  0,
  'a different user cannot read another personal collection'
);

SELECT set_config('request.jwt.claim.sub', '44000000-0000-0000-0000-000000000001', true);
SELECT throws_ok(
  $$INSERT INTO public.document_library_memberships (user_id, document_id)
    VALUES (
      '44000000-0000-0000-0000-000000000002',
      '45000000-0000-0000-0000-000000000001'
    )$$,
  '42501',
  NULL,
  'a user cannot create membership for another user'
);

DELETE FROM public.document_library_memberships
WHERE document_id = '45000000-0000-0000-0000-000000000001';
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '45000000-0000-0000-0000-000000000001'),
  1,
  'removing membership does not delete the canonical document'
);

SELECT is(
  (SELECT source_identity FROM public.documents
    WHERE id = '45000000-0000-0000-0000-000000000001'),
  'project-gutenberg:1234:epub:/cache/epub/1234/pg1234-images.epub',
  'canonical identity records include format and edition path'
);

SELECT ok(
  has_table_privilege('authenticated', 'public.document_library_memberships', 'INSERT')
    AND has_table_privilege('authenticated', 'public.document_library_memberships', 'DELETE'),
  'signed-in users can manage their own memberships'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.document_library_memberships', 'SELECT'),
  'anonymous clients cannot read personal memberships'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

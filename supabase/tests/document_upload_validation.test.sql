BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(6);

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
VALUES (
  '00000000-0000-0000-0000-000000000000',
  '43000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'upload-validation@example.test',
  '',
  now(),
  now(),
  now()
);

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'documents'),
  52428800::bigint,
  'the document bucket enforces the 50 MB file-size ceiling'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000001', true);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'documents',
  '43000000-0000-0000-0000-000000000001/valid.pdf',
  '43000000-0000-0000-0000-000000000001',
  '{"mimetype":"application/pdf","size":100}'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE name = '43000000-0000-0000-0000-000000000001/valid.pdf'),
  1,
  'an owner can upload a supported document with matching metadata'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'documents',
      '43000000-0000-0000-0000-000000000001/forged.pdf',
      '43000000-0000-0000-0000-000000000001',
      '{"mimetype":"image/jpeg","size":100}'
    )$$,
  '42501',
  NULL,
  'a document extension cannot be paired with an unrelated MIME type'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'documents',
      '43000000-0000-0000-0000-000000000001/large-cover-cover.jpg',
      '43000000-0000-0000-0000-000000000001',
      '{"mimetype":"image/jpeg","size":5242881}'
    )$$,
  '42501',
  NULL,
  'cover uploads are limited to 5 MB'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'documents',
      '43000000-0000-0000-0000-000000000001/large.pdf',
      '43000000-0000-0000-0000-000000000001',
      '{"mimetype":"application/pdf","size":52428801}'
    )$$,
  '42501',
  NULL,
  'document uploads are limited to 50 MB'
);

SELECT throws_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'documents',
      '43000000-0000-0000-0000-000000000001/unknown.pdf',
      '43000000-0000-0000-0000-000000000001',
      '{"mimetype":"application/pdf","size":"unknown"}'
    )$$,
  '42501',
  NULL,
  'uploads with missing or malformed size metadata fail closed'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

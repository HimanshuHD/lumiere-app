BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(12);

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

INSERT INTO public.documents (
  id,
  title,
  author,
  category,
  uploaded_by,
  origin,
  visibility,
  file_format,
  file_storage_path
)
VALUES (
  '43000000-0000-0000-0000-000000000002',
  'Existing validated upload',
  'Test Author',
  'Fiction',
  '43000000-0000-0000-0000-000000000001',
  'user_upload',
  'private',
  'pdf',
  '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000002.pdf'
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'documents',
  '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000002.pdf',
  '43000000-0000-0000-0000-000000000001',
  '{"mimetype":"application/pdf","size":100}'
);

SELECT is(
  (SELECT file_size_limit FROM storage.buckets WHERE id = 'documents'),
  52428800::bigint,
  'the document bucket enforces the 50 MB file-size ceiling'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '43000000-0000-0000-0000-000000000001', true);

SELECT ok(
  EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'documents_bucket_insert'
  ),
  'authenticated clients can stage owner-scoped objects before server-side validation'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'documents_bucket_update'
  ),
  'authenticated clients cannot replace validated files through direct storage updates'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'insert_documents'
  ),
  'authenticated clients must finalize document records through the validation service'
);
SELECT ok(
  NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'documents'
      AND policyname = 'delete_documents'
  ),
  'authenticated clients must use the recoverable document deletion workflow'
);
INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES (
  'documents',
  '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000003.pdf',
  '43000000-0000-0000-0000-000000000001',
  '{"mimetype":"application/pdf","size":100}'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE name = '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000003.pdf'),
  1,
  'owners can stage files with supported metadata for byte-level finalization'
);
SELECT is(
  public.can_cleanup_document_storage_object(
    '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000002.pdf'
  ),
  false,
  'an owner cannot directly delete storage files while their document record exists'
);
SELECT throws_ok(
  $$UPDATE public.documents SET file_format = 'txt'
    WHERE id = '43000000-0000-0000-0000-000000000002'$$,
  '42501',
  NULL,
  'an owner cannot change the validated upload format after finalization'
);
DELETE FROM public.documents
WHERE id = '43000000-0000-0000-0000-000000000002';
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '43000000-0000-0000-0000-000000000002'),
  1,
  'an owner cannot bypass recoverable deletion with a direct delete'
);
SELECT throws_ok(
  $$INSERT INTO public.documents (
      title, author, category, uploaded_by, origin, visibility, file_format
    ) VALUES (
      'Unvalidated upload', 'Test Author', 'Fiction',
      '43000000-0000-0000-0000-000000000001', 'user_upload', 'private', 'pdf'
    )$$,
  '42501',
  NULL,
  'an owner cannot attach an unvalidated object by directly inserting a document'
);

SELECT lives_ok(
  $$INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
    VALUES (
      'documents',
      '43000000-0000-0000-0000-000000000001/43000000-0000-4000-8000-000000000004.pdf',
      '43000000-0000-0000-0000-000000000001',
      '{"mimetype":"image/jpeg","size":"unknown"}'
    )$$,
  'owner-scoped objects can stage despite client metadata because finalization validates bytes'
);
SELECT ok(
  EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'storage'
      AND tablename = 'objects'
      AND policyname = 'documents_bucket_insert'
      AND with_check LIKE '%can_cleanup_document_storage_object%'
      AND with_check NOT LIKE '%metadata%'
  ),
  'staging is limited to unused owner paths without relying on pre-insert metadata'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

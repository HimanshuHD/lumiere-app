BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(11);

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
    '51000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'deletion-owner@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000002',
    '51000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'deletion-reader@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000003',
    '51000000-0000-0000-0000-000000000003',
    'authenticated',
    'authenticated',
    'deletion-bookmarker@example.test',
    '',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000004',
    '51000000-0000-0000-0000-000000000004',
    'authenticated',
    'authenticated',
    'deletion-stranger@example.test',
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
  file_storage_path,
  cover_storage_path
)
VALUES (
  '52000000-0000-0000-0000-000000000001',
  'Visibility changed upload',
  'Test Author',
  'Fiction',
  '51000000-0000-0000-0000-000000000001',
  'user_upload',
  'private',
  '51000000-0000-0000-0000-000000000001/deletion-book.pdf',
  '51000000-0000-0000-0000-000000000001/deletion-cover.jpg'
);

INSERT INTO storage.objects (bucket_id, name, owner_id, metadata)
VALUES
  (
    'documents',
    '51000000-0000-0000-0000-000000000001/deletion-book.pdf',
    '51000000-0000-0000-0000-000000000001',
    '{"mimetype":"application/pdf","size":1}'
  ),
  (
    'documents',
    '51000000-0000-0000-0000-000000000001/deletion-cover.jpg',
    '51000000-0000-0000-0000-000000000001',
    '{"mimetype":"image/jpeg","size":1}'
  );

INSERT INTO public.bookmarks (id, user_id, document_id)
VALUES
  ('53000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001'),
  ('53000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000001');

INSERT INTO public.reading_progress (id, user_id, document_id)
VALUES (
  '54000000-0000-0000-0000-000000000001',
  '51000000-0000-0000-0000-000000000002',
  '52000000-0000-0000-0000-000000000001'
);

INSERT INTO public.reading_list (id, user_id, document_id)
VALUES
  ('55000000-0000-0000-0000-000000000001', '51000000-0000-0000-0000-000000000002', '52000000-0000-0000-0000-000000000001'),
  ('55000000-0000-0000-0000-000000000002', '51000000-0000-0000-0000-000000000003', '52000000-0000-0000-0000-000000000001');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000002', true);

SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '52000000-0000-0000-0000-000000000001'),
  1,
  'a user with a saved reference can read the now-private document metadata'
);
SELECT is(
  (SELECT count(*)::integer FROM storage.objects
    WHERE name = '51000000-0000-0000-0000-000000000001/deletion-book.pdf'),
  0,
  'a saved reference does not grant access to the private document file'
);
SELECT throws_ok(
  $$SELECT * FROM public.get_user_upload_deletion_impact('52000000-0000-0000-0000-000000000001')$$,
  '42501',
  NULL,
  'a non-owner cannot inspect document deletion impact'
);

SELECT set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000004', true);
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '52000000-0000-0000-0000-000000000001'),
  0,
  'users without a reference cannot read private document metadata'
);

SELECT set_config('request.jwt.claim.sub', '51000000-0000-0000-0000-000000000001', true);
SELECT is(
  (SELECT bookmark_users FROM public.get_user_upload_deletion_impact('52000000-0000-0000-0000-000000000001')),
  2::bigint,
  'deletion preview counts distinct bookmark users'
);
SELECT is(
  (SELECT reading_users FROM public.get_user_upload_deletion_impact('52000000-0000-0000-0000-000000000001')),
  1::bigint,
  'deletion preview counts distinct readers'
);
SELECT is(
  (SELECT reading_list_users FROM public.get_user_upload_deletion_impact('52000000-0000-0000-0000-000000000001')),
  2::bigint,
  'deletion preview counts distinct Read Later users'
);

SELECT is(
  public.delete_owned_user_upload('52000000-0000-0000-0000-000000000001')->>'bookmark_users',
  '2',
  'owner deletion returns the final reference counts'
);
SELECT is(
  (SELECT count(*)::integer FROM public.documents
    WHERE id = '52000000-0000-0000-0000-000000000001'),
  0,
  'owner deletion removes the upload'
);
SELECT is(
  (SELECT count(*)::integer FROM public.document_lifecycle_recovery
    WHERE operation_id = '52000000-0000-0000-0000-000000000001'
      AND failure_stage = 'document-delete'
      AND status = 'cleanup_pending'),
  2,
  'owner deletion durably queues both storage objects for cleanup'
);
SELECT is(
  (SELECT count(*)::integer FROM public.bookmarks
      WHERE document_id = '52000000-0000-0000-0000-000000000001')
    + (SELECT count(*)::integer FROM public.reading_progress
      WHERE document_id = '52000000-0000-0000-0000-000000000001')
    + (SELECT count(*)::integer FROM public.reading_list
      WHERE document_id = '52000000-0000-0000-0000-000000000001'),
  0,
  'deleting an upload cascades all user references'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

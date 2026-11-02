BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(7);

INSERT INTO auth.users (id, aud, role, email)
VALUES ('71000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated', 'legacy-reader@example.test');
INSERT INTO public.documents
  (id, title, author, category, origin, visibility, uploaded_by, source_identity, source_url, file_format)
VALUES
  ('72000000-0000-4000-8000-000000000001', 'Legacy EPUB', 'Author', 'Fiction',
    'legacy_unowned', 'private', NULL, 'project-gutenberg:1342',
    'https://www.gutenberg.org/ebooks/1342.epub3.images?download=1#cover', 'epub'),
  ('72000000-0000-4000-8000-000000000002', 'Legacy PDF', 'Author', 'Fiction',
    'legacy_unowned', 'private', NULL, 'project-gutenberg:1342',
    'https://www.gutenberg.org/cache/epub/1342/Edition.PDF', 'pdf'),
  ('72000000-0000-4000-8000-000000000003', 'Unknown legacy', 'Author', 'Fiction',
    'legacy_unowned', 'private', NULL, 'project-gutenberg:9999', NULL, NULL);
INSERT INTO public.bookmarks (user_id, document_id)
VALUES ('71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001');
INSERT INTO public.reading_progress (user_id, document_id, scroll_percent)
VALUES ('71000000-0000-4000-8000-000000000001', '72000000-0000-4000-8000-000000000001', 0.6);

-- Replay the real data migration against pre-migration fixtures.
\ir ../migrations/20261102000900_migrate_legacy_catalog_edition_identities.sql

SELECT is((SELECT source_identity FROM public.documents WHERE id = '72000000-0000-4000-8000-000000000001'),
  'project-gutenberg:1342:epub:/ebooks/1342.epub3.images',
  'the importer can locate the original EPUB record by its new edition identity');
SELECT is((SELECT source_identity FROM public.documents WHERE id = '72000000-0000-4000-8000-000000000002'),
  'project-gutenberg:1342:pdf:/cache/epub/1342/edition.pdf',
  'PDF editions retain a distinct normalized identity');
SELECT is((SELECT source_identity FROM public.documents WHERE id = '72000000-0000-4000-8000-000000000003'),
  'project-gutenberg:9999', 'unknown source/format remains quarantined for review');
SELECT is((SELECT count(*)::int FROM public.bookmarks WHERE document_id = '72000000-0000-4000-8000-000000000001'),
  1, 'the original bookmark still references the original document ID');
SELECT is((SELECT scroll_percent FROM public.reading_progress WHERE document_id = '72000000-0000-4000-8000-000000000001'),
  0.6::numeric, 'reading progress survives identity migration');
SELECT ok((SELECT visibility = 'private' AND origin = 'legacy_unowned' AND uploaded_by IS NULL
  FROM public.documents WHERE id = '72000000-0000-4000-8000-000000000001'),
  'identity migration does not bypass server-side revalidation or grant access');

\ir ../migrations/20261102000900_migrate_legacy_catalog_edition_identities.sql
SELECT is((SELECT source_identity FROM public.documents WHERE id = '72000000-0000-4000-8000-000000000001'),
  'project-gutenberg:1342:epub:/ebooks/1342.epub3.images', 'identity migration is safe to replay');
SELECT * FROM finish();
ROLLBACK;

-- Read-only diagnostic: run as a privileged operator in local Supabase Studio.
-- Missing rows need the opt-in seed. catalog_import rows need migration 011.
WITH expected(id, title) AS (VALUES
  ('4350bfc7-cd8c-4725-9d1b-9051c7a32866'::uuid, 'The Silent Observer'),
  ('5f85fae3-360a-45d9-a9cb-513c302e079e'::uuid, 'Beyond the Horizon'),
  ('77123519-4519-4883-9e24-b728caec341a'::uuid, 'Echoes of Empire'),
  ('54c48967-1e6d-4d4c-8e9c-3d231b20f29b'::uuid, 'The Art of Stillness'),
  ('e488bba3-8393-4b5b-8070-be2ac30da5ae'::uuid, 'Into the Wild Green'),
  ('c2c801f8-e2c7-4390-a592-db1900526a70'::uuid, 'The Digital Mind'),
  ('b3bcd430-e854-45bf-86df-eb7251fb2d82'::uuid, 'Whispers of the Heart'),
  ('666d33ce-a9a8-4d2c-9d63-483188180020'::uuid, 'The Mountain Within')
)
SELECT expected.id, expected.title, document.origin, document.visibility,
  document.file_format,
  CASE WHEN document.id IS NULL THEN 'missing'
    WHEN document.origin = 'demo' THEN 'ready'
    ELSE 'review classification / migrations' END AS status,
  CASE WHEN jsonb_typeof(document.chapters) = 'array' THEN jsonb_array_length(document.chapters) ELSE 0 END AS chapters,
  (SELECT count(*) FROM public.bookmarks WHERE document_id = expected.id) AS bookmarks,
  (SELECT count(*) FROM public.reading_progress WHERE document_id = expected.id) AS progress_entries,
  (SELECT count(*) FROM public.reading_list WHERE document_id = expected.id) AS reading_list_entries
FROM expected LEFT JOIN public.documents AS document ON document.id = expected.id
ORDER BY expected.title;

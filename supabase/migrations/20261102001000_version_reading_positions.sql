-- Typed positions coexist with the legacy columns used by library progress cards.
ALTER TABLE public.reading_progress
  ADD COLUMN position jsonb,
  ADD COLUMN revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN mutation_id uuid;

-- Compare-and-swap prevents a delayed writer from replacing a newer action.
-- SECURITY INVOKER preserves the existing owner/document-access RLS policies.
CREATE OR REPLACE FUNCTION public.save_reading_position(
  p_user_id uuid, p_document_id uuid, p_position jsonb, p_chapter_index integer,
  p_scroll_percent numeric, p_expected_revision bigint, p_mutation_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY INVOKER SET search_path = pg_catalog
AS $$
DECLARE saved public.reading_progress; current_row public.reading_progress;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() IS DISTINCT FROM p_user_id THEN RAISE EXCEPTION 'Authentication required'; END IF;
  IF p_position IS NULL OR jsonb_typeof(p_position) <> 'object'
    OR p_position->>'version' IS DISTINCT FROM '1'
    OR p_position->>'format' IS NULL OR p_position->>'format' NOT IN ('txt','pdf','epub')
    OR p_chapter_index IS NULL OR p_chapter_index < 0
    OR p_scroll_percent IS NULL OR p_scroll_percent NOT BETWEEN 0 AND 1
    OR p_expected_revision IS NULL OR p_expected_revision < 0 OR p_mutation_id IS NULL
  THEN RAISE EXCEPTION 'Invalid reading position'; END IF;

  INSERT INTO public.reading_progress AS progress
    (user_id, document_id, position, chapter_index, scroll_percent, epub_cfi, revision, mutation_id, updated_at)
  SELECT auth.uid(), p_document_id, p_position, p_chapter_index, p_scroll_percent,
    CASE WHEN p_position->>'format' = 'epub' THEN p_position->>'cfi' END,
    1, p_mutation_id, now()
  WHERE p_expected_revision = 0
  ON CONFLICT (user_id, document_id) DO NOTHING
  RETURNING * INTO saved;

  IF saved.id IS NULL THEN
    UPDATE public.reading_progress AS progress SET
      position = p_position, chapter_index = p_chapter_index, scroll_percent = p_scroll_percent,
      epub_cfi = CASE WHEN p_position->>'format' = 'epub' THEN p_position->>'cfi' END,
      revision = progress.revision + 1, mutation_id = p_mutation_id, updated_at = now()
    WHERE progress.user_id = auth.uid() AND progress.document_id = p_document_id
      AND progress.revision = p_expected_revision AND progress.mutation_id IS DISTINCT FROM p_mutation_id
    RETURNING * INTO saved;
  END IF;
  IF saved.id IS NOT NULL THEN RETURN jsonb_build_object('accepted', true, 'row', to_jsonb(saved)); END IF;
  SELECT * INTO current_row FROM public.reading_progress
    WHERE user_id = auth.uid() AND document_id = p_document_id;
  RETURN jsonb_build_object('accepted', current_row.mutation_id = p_mutation_id, 'row', to_jsonb(current_row));
END;
$$;
REVOKE ALL ON FUNCTION public.save_reading_position(uuid,uuid,jsonb,integer,numeric,bigint,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_reading_position(uuid,uuid,jsonb,integer,numeric,bigint,uuid) TO authenticated;

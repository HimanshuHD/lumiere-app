-- Summary lists no longer need the potentially large chapter bodies.
ALTER TABLE public.documents ADD COLUMN chapter_count integer GENERATED ALWAYS AS (
  CASE WHEN jsonb_typeof(chapters) = 'array' THEN jsonb_array_length(chapters) ELSE 0 END
) STORED;

-- Retain the existing redaction/authorization contract, but omit chapter bodies.
CREATE OR REPLACE FUNCTION public.get_locked_document_summaries()
RETURNS SETOF jsonb LANGUAGE sql STABLE SECURITY INVOKER SET search_path = pg_catalog
AS $$
  SELECT (to_jsonb(reference) - 'chapters') || jsonb_build_object('chapter_count', 0)
  FROM public.get_locked_user_upload_references() AS reference;
$$;
REVOKE ALL ON FUNCTION public.get_locked_document_summaries() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_locked_document_summaries() TO authenticated;

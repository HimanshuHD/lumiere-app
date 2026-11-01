CREATE TABLE public.opds_feed_rate_limits (
  client_ip_hash text PRIMARY KEY
    CHECK (client_ip_hash ~ '^[0-9a-f]{64}$'),
  window_started_at timestamptz NOT NULL,
  request_count integer NOT NULL CHECK (request_count > 0)
);

CREATE INDEX opds_feed_rate_limits_window_started_at_idx
  ON public.opds_feed_rate_limits (window_started_at);

ALTER TABLE public.opds_feed_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.opds_feed_rate_limits FROM PUBLIC, anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.consume_opds_feed_rate_limit(
  p_client_ip_hash text,
  p_max_requests integer
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  current_window timestamptz := date_trunc('minute', now());
  current_count integer;
BEGIN
  IF p_client_ip_hash IS NULL
     OR p_max_requests IS NULL
     OR p_client_ip_hash !~ '^[0-9a-f]{64}$'
     OR p_max_requests < 1
     OR p_max_requests > 100 THEN
    RETURN false;
  END IF;

  IF random() < 0.01 THEN
    DELETE FROM public.opds_feed_rate_limits
    WHERE window_started_at < current_window - interval '1 day';
  END IF;

  INSERT INTO public.opds_feed_rate_limits (
    client_ip_hash,
    window_started_at,
    request_count
  )
  VALUES (p_client_ip_hash, current_window, 1)
  ON CONFLICT (client_ip_hash) DO UPDATE
  SET
    window_started_at = CASE
      WHEN public.opds_feed_rate_limits.window_started_at < current_window
        THEN current_window
      ELSE public.opds_feed_rate_limits.window_started_at
    END,
    request_count = CASE
      WHEN public.opds_feed_rate_limits.window_started_at < current_window
        THEN 1
      ELSE public.opds_feed_rate_limits.request_count + 1
    END
  RETURNING request_count INTO current_count;

  RETURN current_count <= p_max_requests;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_opds_feed_rate_limit(text, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_opds_feed_rate_limit(text, integer) TO service_role;

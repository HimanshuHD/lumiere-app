CREATE SCHEMA pilot_admission;
REVOKE ALL ON SCHEMA pilot_admission FROM PUBLIC, anon, authenticated;
GRANT USAGE ON SCHEMA pilot_admission TO anon, authenticated, service_role, authenticator;

CREATE TABLE pilot_admission.settings (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  enabled boolean NOT NULL DEFAULT false
);
INSERT INTO pilot_admission.settings DEFAULT VALUES;

CREATE TABLE pilot_admission.approved_accounts (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE
);
REVOKE ALL ON ALL TABLES IN SCHEMA pilot_admission FROM PUBLIC, anon, authenticated;

CREATE FUNCTION public.pilot_access_allowed()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE((
    SELECT NOT settings.enabled OR EXISTS (
      SELECT 1 FROM pilot_admission.approved_accounts AS account
      WHERE account.user_id = auth.uid()
    )
    FROM pilot_admission.settings AS settings
    WHERE settings.singleton
  ), false);
$$;
REVOKE ALL ON FUNCTION public.pilot_access_allowed() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pilot_access_allowed() TO anon, authenticated, service_role, authenticator;

-- The Data API hook also covers RPCs that run with the function owner's privileges.
CREATE FUNCTION pilot_admission.check_data_api_request()
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF current_user IN ('anon', 'authenticated') AND NOT public.pilot_access_allowed() THEN
    RAISE EXCEPTION 'This account is not approved for the Lumiere pilot.' USING ERRCODE = '42501';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION pilot_admission.check_data_api_request() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pilot_admission.check_data_api_request() TO anon, authenticated, service_role, authenticator;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_db_role_setting AS settings
    CROSS JOIN LATERAL unnest(settings.setconfig) AS config(value)
    WHERE settings.setrole = 'authenticator'::regrole
      AND config.value LIKE 'pgrst.db_pre_request=%'
  ) THEN
    RAISE EXCEPTION 'Preserve the existing PostgREST pre-request hook before installing pilot admission.';
  END IF;
END;
$$;
ALTER ROLE authenticator SET pgrst.db_pre_request = 'pilot_admission.check_data_api_request';
NOTIFY pgrst, 'reload config';

-- Storage uses its own API and does not run the Data API hook.
CREATE POLICY pilot_admission_required ON storage.objects
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (bucket_id NOT IN ('documents', 'avatars') OR (SELECT public.pilot_access_allowed()))
  WITH CHECK (bucket_id NOT IN ('documents', 'avatars') OR (SELECT public.pilot_access_allowed()));

-- Apply the same restriction to RLS-based reads outside PostgREST, such as Realtime.
DO $$
DECLARE
  application_table regclass;
BEGIN
  FOR application_table IN
    SELECT relation.oid::regclass
    FROM pg_class AS relation
    JOIN pg_namespace AS namespace ON namespace.oid = relation.relnamespace
    WHERE namespace.nspname = 'public' AND relation.relkind = 'r' AND relation.relrowsecurity
  LOOP
    EXECUTE format(
      'CREATE POLICY pilot_admission_required ON %s AS RESTRICTIVE FOR ALL TO anon, authenticated
       USING ((SELECT public.pilot_access_allowed())) WITH CHECK ((SELECT public.pilot_access_allowed()))',
      application_table
    );
  END LOOP;
END;
$$;

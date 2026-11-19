BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

SET LOCAL ROLE anon;
SELECT is(public.pilot_access_allowed(), true, 'existing anonymous behavior is preserved before activation');
RESET ROLE;

INSERT INTO auth.users (id, aud, role, email)
VALUES
  ('10000000-0000-4000-8000-000000000048', 'authenticated', 'authenticated', 'pilot-approved@example.test'),
  ('10000000-0000-4000-8000-000000000049', 'authenticated', 'authenticated', 'pilot-unapproved@example.test');

INSERT INTO pilot_admission.approved_accounts (user_id)
VALUES ('10000000-0000-4000-8000-000000000048');
UPDATE pilot_admission.settings SET enabled = true WHERE singleton;

SET LOCAL ROLE anon;
SELECT is(public.pilot_access_allowed(), false, 'anonymous is denied when pilot admission is active');
SELECT throws_ok(
  'SELECT pilot_admission.check_data_api_request()',
  '42501', 'This account is not approved for the Lumiere pilot.',
  'the Data API pre-request gate rejects anonymous requests'
);

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000049', true);
SELECT throws_ok(
  'SELECT pilot_admission.check_data_api_request()',
  '42501', 'This account is not approved for the Lumiere pilot.',
  'sign-in alone does not grant Data API access'
);
SELECT ok(
  NOT has_table_privilege(current_user, 'pilot_admission.approved_accounts', 'INSERT'),
  'signed-in users cannot grant themselves admission'
);

SELECT set_config('request.jwt.claim.sub', '10000000-0000-4000-8000-000000000048', true);
SELECT lives_ok('SELECT pilot_admission.check_data_api_request()', 'an approved account can use the Data API');
SELECT is(public.pilot_access_allowed(), true, 'approved accounts satisfy the RLS gate');

RESET ROLE;
DELETE FROM pilot_admission.approved_accounts WHERE user_id = '10000000-0000-4000-8000-000000000048';
SET LOCAL ROLE authenticated;
SELECT is(public.pilot_access_allowed(), false, 'revocation applies even with the original session claim');

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

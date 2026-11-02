BEGIN;
CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(10);
INSERT INTO auth.users (id, aud, role, email, encrypted_password, created_at, updated_at)
VALUES
 ('61000000-0000-4000-8000-000000000001','authenticated','authenticated','position-a@example.test','',now(),now()),
 ('61000000-0000-4000-8000-000000000002','authenticated','authenticated','position-b@example.test','',now(),now());
INSERT INTO public.documents (id,title,author,category,uploaded_by,origin,visibility,file_format)
VALUES
 ('62000000-0000-4000-8000-000000000001','Position fixture','QA','Tests','61000000-0000-4000-8000-000000000001','user_upload','private','pdf'),
 ('62000000-0000-4000-8000-000000000002','Other private fixture','QA','Tests','61000000-0000-4000-8000-000000000002','user_upload','private','pdf');
SELECT ok(NOT has_function_privilege('anon','public.save_reading_position(uuid,uuid,jsonb,integer,numeric,bigint,uuid)','EXECUTE'), 'anonymous users cannot save positions');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','61000000-0000-4000-8000-000000000001',true);
SELECT is((public.save_reading_position(
 '61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
 '{"version":1,"format":"pdf","page":8,"view":{"mode":"width"}}',0,.8,0,'63000000-0000-4000-8000-000000000001')->>'accepted')::boolean,true,'first action is accepted');
SELECT is((SELECT revision FROM public.reading_progress),1::bigint,'first action has revision 1');
SELECT is((public.save_reading_position(
 '61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
 '{"version":1,"format":"pdf","page":8,"view":{"mode":"width"}}',0,.8,0,'63000000-0000-4000-8000-000000000001')->>'accepted')::boolean,true,'lost acknowledgement can replay idempotently');
SELECT is((SELECT revision FROM public.reading_progress),1::bigint,'replay does not increment revision');
SELECT is((public.save_reading_position(
 '61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
 '{"version":1,"format":"pdf","page":3,"view":{"mode":"manual","scale":1.8}}',0,.3,1,'63000000-0000-4000-8000-000000000002')->>'accepted')::boolean,true,'intentional backwards navigation is accepted');
SELECT is((public.save_reading_position(
 '61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000001',
 '{"version":1,"format":"pdf","page":8,"view":{"mode":"width"}}',0,.8,0,'63000000-0000-4000-8000-000000000001')->>'accepted')::boolean,false,'delayed action cannot overwrite latest revision');
SELECT is((SELECT position->>'page' FROM public.reading_progress),'3','latest position remains page 3');
SELECT throws_ok($$SELECT public.save_reading_position(
 '61000000-0000-4000-8000-000000000002','62000000-0000-4000-8000-000000000001',
 '{"version":1,"format":"pdf","page":1}',0,0,2,'63000000-0000-4000-8000-000000000003')$$,
 'P0001','Authentication required','account switches cannot replay another account data');
SELECT throws_ok($$SELECT public.save_reading_position(
 '61000000-0000-4000-8000-000000000001','62000000-0000-4000-8000-000000000002',
 '{"version":1,"format":"pdf","page":1}',0,0,0,'63000000-0000-4000-8000-000000000003')$$,
 '42501',NULL,'save RPC retains document-access RLS');
SELECT * FROM finish();
ROLLBACK;

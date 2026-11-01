BEGIN;

CREATE EXTENSION IF NOT EXISTS pgtap WITH SCHEMA extensions;
SELECT plan(8);

SELECT ok(
  has_function_privilege(
    'service_role',
    'public.consume_opds_feed_rate_limit(text, integer)',
    'EXECUTE'
  ),
  'service role can consume OPDS feed quota'
);

SELECT ok(
  NOT has_function_privilege(
    'anon',
    'public.consume_opds_feed_rate_limit(text, integer)',
    'EXECUTE'
  ),
  'anonymous clients cannot consume or manipulate stored quotas'
);

SELECT ok(
  NOT has_table_privilege('anon', 'public.opds_feed_rate_limits', 'SELECT')
    AND NOT has_table_privilege('authenticated', 'public.opds_feed_rate_limits', 'SELECT'),
  'client roles cannot read hashed client identifiers'
);

SET LOCAL ROLE service_role;

SELECT ok(
  public.consume_opds_feed_rate_limit(repeat('a', 64), 5),
  'first request is allowed'
);
SELECT ok(
  public.consume_opds_feed_rate_limit(repeat('a', 64), 5),
  'requests within the configured quota are allowed'
);
SELECT ok(
  public.consume_opds_feed_rate_limit(repeat('a', 64), 5)
    AND public.consume_opds_feed_rate_limit(repeat('a', 64), 5)
    AND public.consume_opds_feed_rate_limit(repeat('a', 64), 5),
  'the fifth request is allowed'
);
SELECT ok(
  NOT public.consume_opds_feed_rate_limit(repeat('a', 64), 5),
  'requests above the configured quota are denied'
);
SELECT ok(
  NOT public.consume_opds_feed_rate_limit(repeat('b', 64), 101),
  'invalid quota values fail closed'
);

RESET ROLE;
SELECT * FROM finish();
ROLLBACK;

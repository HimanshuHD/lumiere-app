# Committed data review — 2026-11-05

## Disposition

`supabase/export_data.sql` and `supabase/snippets/data_dump.sql` were duplicate historical
project dumps containing Auth user rows, profile records, bookmarks, reading progress and
document/storage references. They were not an appropriate deterministic seed. This review
does not reproduce personal values. Both files now contain no-op guidance to the synthetic seed.

`supabase/snippets/data_dump_verify.sql` is a read-only inventory query, not a dataset; retained.
`supabase/seeds/demo.sql` contains eight explicit generated TXT stories and stable IDs, without
accounts or personal activity. It remains opt-in and idempotent. Database/browser tests use
synthetic account identifiers and example.test addresses, not historical account records.

## Review performed

Inspected table targets, account/password fields, URL/storage references and token-like patterns
in the two dumps. They included account addresses and personal activity; no JWT-like token or
bcrypt-style password hash was identified by those checks. Pattern checks do not establish that
all possible credentials are absent, and empty/exported auth fields are not a supported login fixture.

Replacing these files does not erase earlier Git commits. No history rewrite or account action
is performed by this PR. The owner should keep repository/history access appropriate for the
historical data and decide whether a separately coordinated history purge is needed. If any actual
credential is subsequently identified, revoke/rotate it; deleting a file is not credential revocation.

## Ongoing rule

Keep production backups outside source control. New fixtures must be synthetic, minimal and
document their purpose. Do not restore complete historical dumps to recover demo documents.
For application migration classifications and existing legacy records, retain the migrations and
follow SECURITY_DEPLOYMENT.md; removing a dump does not alter live database rows or storage.

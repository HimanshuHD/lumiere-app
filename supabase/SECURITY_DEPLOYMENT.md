# Document access security deployment

## What the migration changes

`20261101170000_secure_document_ownership_visibility.sql` adds document origin, visibility, canonical source identity, and storage-path fields. Its legacy classification is explicit:

- The nine curated seed IDs included in `supabase/export_data.sql` become shared catalog records with no owner.
- Rows with a non-null `uploaded_by` and no `source_url` become private user uploads owned by that user.
- Existing source-URL imports and other unclassified rows become `legacy_unowned`, are private and unreadable to regular users, and require verification before they can be made shared. Eligible Project Gutenberg records can be restored by importing them again through the validated catalog flow; it preserves the document ID and personal references while auditing the previous storage paths. Other legacy records require privileged review.
- Existing catalog duplicates with the same normalized source URL are merged. Bookmarks and reading-list entries are retained, and the newest reading-progress row is kept per user.
- Storage URLs that point into the `documents` bucket are converted to object paths. Persisted document URLs are cleared.
- File URLs that cannot be mapped to a bucket object are copied to the server-only `document_security_migration_audit` table for review before restoring access.
- Legacy document or cover URLs whose storage objects are absent from this project are retained in the audit table for manual review and are not converted into local storage paths. Curated shared records may continue using their existing external cover URL when the corresponding local object is unavailable; private uploads do not fall back to public storage URLs.
- Duplicate catalog object paths are also recorded in that audit table. The migration does not remove storage objects.

Review the seed-ID allowlist and ownership classifications against a production backup before applying the migration. The audit table has RLS enabled and no client policies; inspect it with a privileged database connection.

## Deployment order

1. Back up the database and inventory the `documents` bucket before deploying. Record document IDs, `uploaded_by`, `source_url`, `file_url`, `cover_url`, and existing storage object paths.
2. Deploy the updated `opds-fetch` Edge Function. It requires the Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` environment values. Never expose the service-role key to the browser.
3. Apply the database migrations, including the upload-staging policy migration. Storage INSERT authorization only permits unused, owner-folder paths with the expected upload naming pattern. Do not rely on object metadata inside the Storage INSERT policy: Storage sets authoritative size and MIME metadata as part of object creation. The `finalize-user-document-upload` Edge Function downloads the staged bytes, validates their signatures, extension, size, and content format, and only then creates the document row.
4. Deploy the updated frontend immediately after the migration and require users to reload. During this transition, older clients that still depend on public document URLs will stop loading files.
5. Verify the audit table, object-path references, private/shared reads, owner-only writes, and catalog imports using two test accounts before restoring normal use.

Do not run `supabase db reset` against data that must be retained. This migration changes live access policy and is not intended to be rolled back by simply making the bucket public again.

## Signed URL behavior

The frontend requests authenticated signed links that expire after 15 minutes and refreshes them while the view remains open. Changing a document from Shared to Private prevents new signed-link grants to other users. A link already issued may work until its expiry, and files already downloaded or copied cannot be revoked.

Anonymous users cannot read document rows or document-bucket objects. External cover images that were already stored as external URLs remain external; uploaded covers use the private bucket and the same document visibility policy.
The separate avatars bucket remains public-read, with insert, update, and delete constrained to the authenticated owner’s user-ID folder.
Document owners can also access objects under their own user-ID folder for storage cleanup, including objects left behind before a document row was created or after it was deleted. A privileged reference check prevents cleanup access to any path still referenced by a document, including quarantined legacy rows hidden by row-level security; it does not expose document metadata or another user’s folder. The same protected-reference check is applied to document inserts and updates, so an owner cannot alias a protected file into a new upload. Storage deletion is restricted to genuinely orphaned objects or files attached to the caller’s own upload.

## Privileged catalog maintenance

Authorized catalog maintenance is available at `/admin/catalog`. The page is hidden from ordinary users, and both its Edge Function and database RPC independently require a trusted `app_metadata.role` value of `admin`. The database checks the current `auth.users.raw_app_meta_data`, rather than trusting editable profile or user metadata. A direct URL or client-side role change does not grant access.

Assign or revoke this role only through a trusted server-side Supabase Auth Admin API client, such as `supabase.auth.admin.updateUserById(userId, { app_metadata: { role: 'admin' } })`. That client must use a server-only service-role key; never put the key in the browser or a `VITE_` variable. Have the administrator sign out and back in after a role change so the frontend receives an updated claim.

Global deletion permanently removes the canonical document and cascades its bookmarks, reading progress, Read Later entries, and collection memberships. A confirmation lists distinct affected-user counts. File and cover cleanup is durably queued and retried through the admin Edge Function; a storage path still referenced by another document is retained. Configure the single-page application host to serve `index.html` for `/admin/catalog` so the URL also works when opened directly.

Deploy `20261102000500_add_privileged_catalog_deletion.sql` before the `admin-catalog-maintenance` Edge Function and frontend. The function uses Supabase-provided `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY`; keep all service-role access server-side.

## OPDS outbound request policy

The OPDS fetch protections delivered for [issue #10](https://github.com/HimanshuHD/lumiere-app/issues/10) are:

- Custom RSS/Atom feeds use HTTPS on the standard port, without URL credentials. IP-literal hosts, unqualified hostnames, and local or special-use hostname suffixes are rejected. Curated catalog browsing and the Project Gutenberg import flow remain supported.
- Initial destinations and every redirect are checked against the URL and DNS-address policies. Redirects are followed manually and are limited to five.
- Requests and response-body reads have a 15-second timeout. Feed responses are limited to 2 MiB and book downloads to 30 MiB.
- Downloaded books must have an EPUB ZIP header with the required first `mimetype` entry or a PDF header; MIME types and filename extensions alone are not trusted.
- Anonymous feed browsing requires a Cloudflare Turnstile challenge. Authenticated browsing requires a valid Supabase user session. Both use a configurable per-IP quota, defaulting to five requests per minute.
- Internal failures are logged server-side and returned to clients as predictable errors without exposing internal details.

The DNS checks do not pin the checked address to the address used by the network connection: native `fetch` resolves the hostname independently. This leaves a DNS-rebinding/time-of-check-to-time-of-use risk. That connection-time enforcement work is intentionally deferred to [issue #21](https://github.com/HimanshuHD/lumiere-app/issues/21), pending a controlled egress proxy; the current checks must not be treated as eliminating the risk.

The focused policy tests are in `tests/opdsFetchPolicy.test.ts`; they cover URL/DNS policy, redirects, time and size bounds, Turnstile/rate-limit helpers, and downloaded-file signatures. The issue #21 follow-up requires additional tests proving that the validated address is the one actually contacted, including DNS rebinding.

Feed browsing is rate-limited to five requests per client IP per minute by default; configure `OPDS_REQUESTS_PER_IP_PER_MINUTE` to an integer from 1 to 100. Authenticated browsing requires a valid Supabase user session and is subject to the same IP quota. Anonymous browsing additionally requires a Cloudflare Turnstile token with the `opds_browse` action. Configure `TURNSTILE_SECRET_KEY` and `TURNSTILE_EXPECTED_HOSTNAME` as Edge Function secrets, and `VITE_TURNSTILE_SITE_KEY` in the frontend build environment. Set the expected hostname to the exact app hostname. The function uses `cf-connecting-ip` when present, otherwise the first address in `x-forwarded-for`; verify that the deployed Supabase gateway supplies/overwrites these headers before relying on IP-based quotas. Rate-limit records store an HMAC of the client IP (using the service-role key), are inaccessible to client roles, and old buckets are periodically removed.

For local development, use Cloudflare's documented test site key `1x00000000000000000000AA` as `VITE_TURNSTILE_SITE_KEY`; put the matching test secret `1x0000000000000000000000000000000AA`, `TURNSTILE_EXPECTED_HOSTNAME=localhost`, `TURNSTILE_EXPECTED_ACTION=test`, and `OPDS_REQUESTS_PER_IP_PER_MINUTE=5` in `supabase/functions/.env`. The test keys are public and must never be used in production. For production, create a widget restricted to the app's exact hostnames, set `TURNSTILE_SECRET_KEY` and `TURNSTILE_EXPECTED_HOSTNAME` as Supabase Edge Function secrets, leave the action at its secure default `opds_browse`, and provide the production site key to the frontend build environment. Never expose the Turnstile secret in a `VITE_` variable.

Run the database policy checks in `supabase/tests/document_security.test.sql` with `npx supabase test db` against a disposable local Supabase database after all migrations, including the cleanup, legacy-file protection, and protected-path association migrations, have been applied. The tests verify that owners can still access genuinely orphaned objects but cannot alias, sign, mutate, or delete an object referenced by a quarantined document. The test command does not apply pending migrations. Do not reset a local database that contains data you need to keep.

## Recovery and review

- Compare every `file_storage_path` and `cover_storage_path` with an object in the `documents` bucket. Investigate missing objects before re-enabling a document in the UI.
- Review `document_security_migration_audit` for unmapped legacy file URLs, duplicate catalog objects, and previous storage paths recorded before validated Gutenberg re-import attempts. Restore access only after confirming the file and its redistribution rights.
- If an object needs recovery, restore it from the storage backup or upload a verified replacement, then update the path through a privileged maintenance operation.
- If deployment validation fails, pause uploads/imports and restore from the prepared database and storage backups. Keep the bucket private during recovery; do not make all files public to work around an application mismatch.
- Project Gutenberg imports are accepted only when the server re-fetches the selected OPDS entry and its rights field explicitly says “Public domain in the USA.” Other catalogs remain browse-only for imports until their redistribution terms and per-title eligibility can be validated.

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
3. Apply the new database migration.
4. Deploy the updated frontend immediately after the migration and require users to reload. During this transition, older clients that still depend on public document URLs will stop loading files.
5. Verify the audit table, object-path references, private/shared reads, owner-only writes, and catalog imports using two test accounts before restoring normal use.

Do not run `supabase db reset` against data that must be retained. This migration changes live access policy and is not intended to be rolled back by simply making the bucket public again.

## Signed URL behavior

The frontend requests authenticated signed links that expire after 15 minutes and refreshes them while the view remains open. Changing a document from Shared to Private prevents new signed-link grants to other users. A link already issued may work until its expiry, and files already downloaded or copied cannot be revoked.

Anonymous users cannot read document rows or document-bucket objects. External cover images that were already stored as external URLs remain external; uploaded covers use the private bucket and the same document visibility policy.
The separate avatars bucket remains public-read, with insert, update, and delete constrained to the authenticated owner’s user-ID folder.
Document owners can also access objects under their own user-ID folder for storage cleanup, including objects left behind before a document row was created or after it was deleted. This cleanup access excludes paths referenced by catalog-import records and does not expose another user’s folder.

Run the database policy checks in `supabase/tests/document_security.test.sql` with `npx supabase test db` against a disposable local Supabase database after all migrations, including this one, have been applied. The test command does not apply pending migrations. Do not reset a local database that contains data you need to keep.

## Recovery and review

- Compare every `file_storage_path` and `cover_storage_path` with an object in the `documents` bucket. Investigate missing objects before re-enabling a document in the UI.
- Review `document_security_migration_audit` for unmapped legacy file URLs, duplicate catalog objects, and previous storage paths recorded before validated Gutenberg re-import attempts. Restore access only after confirming the file and its redistribution rights.
- If an object needs recovery, restore it from the storage backup or upload a verified replacement, then update the path through a privileged maintenance operation.
- If deployment validation fails, pause uploads/imports and restore from the prepared database and storage backups. Keep the bucket private during recovery; do not make all files public to work around an application mismatch.
- Project Gutenberg imports are accepted only when the server re-fetches the selected OPDS entry and its rights field explicitly says “Public domain in the USA.” Other catalogs remain browse-only for imports until their redistribution terms and per-title eligibility can be validated.

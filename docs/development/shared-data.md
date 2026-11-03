# Shared account data (#14)

## Decision

Use a small in-memory account store with immutable `QueryCache` snapshots and React
`useSyncExternalStore`. Existing dependencies suffice; no state/cache library was added.
Services execute Supabase operations; the store owns request deduplication, collection data,
per-item mutation locks and invalidation; hooks subscribe; components display state and actions.
This synchronizes mounted consumers in one app session. It is not cross-tab realtime synchronization.

## Deployment

Apply `supabase/migrations/20261103000000_document_summary_metadata.sql` before this frontend:

```sh
npx supabase migration up --local
```

It adds a generated `chapter_count` column and the authenticated-only
`get_locked_document_summaries()` RPC. This wraps the existing redacted reference RPC and removes
`chapters`; it preserves access rules and explicitly reports zero chapters for locked references.
No reset or data reload is required. Old RPCs remain available for existing clients.

## Ownership, request ordering and account transitions

`features/data/account-store.ts` owns documents, bookmarks, reading list, locked summaries, a
separate lazy catalog-management query, and document-content query caches per account. My Uploads
derives from shared document summaries. Reading progress retains the #13 save coordinator and
account store: durable pending saves, serialized writes and database revision checks are preserved.

`QueryCache` deduplicates an in-flight load, retains confirmed data on refresh failure, and rejects
results whose generation was superseded by another request, confirmed mutation, or account disposal.
Mutations use a shared gate keyed by collection/document; two controls cannot issue competing
requests for the same item. A confirmed mutation invalidates older collection requests before
publishing its result. Unfetched collections remain unfetched after deletion; a partial local update
must not masquerade as a complete empty result.

Logout/account switch disposes old requests and caches. App navigation, active document and toast
state are keyed by account. The auth provider rejects obsolete initial-session/profile responses.
Bookmark/list writes carry the expected user ID, and deletions also filter it; RLS remains the server
boundary. Old progress queues stop sending when disposed, while account-scoped local pending entries
remain available when that account returns. Deleted documents are forgotten and cannot replay.

## Metadata and opening

`DOCUMENT_SUMMARY_FIELDS` explicitly projects metadata, including `chapter_count`, without chapter
bodies. Library, bookmark/list embedded joins, My Uploads and catalog-management lists use summaries.
`DocumentSummary` is a distinct type; unloaded content is never represented as `chapters: []`.
The cover/file controls accept metadata; list completion percentages use typed saved positions and
chapter counts, with legacy fallback.

`ReaderLoader` fetches and revalidates authorized document content on every opening and only mounts
the reader after success. Cached content is hidden until that opening is validated, and an error
cannot fall through to an empty TXT state. Changing selection or account prevents a late result
from replacing the current document. Shared demo and genuine catalog membership behavior remains
unchanged; locked entries never request readable content.

## Mutations, errors and invalidation

Bookmark/list add/remove operations update shared snapshots only after backend success. Removal
must be confirmed; idempotent adds use a unique account/document upsert. Required metadata is fetched
before insertion, so a post-insert metadata failure cannot disguise a successful mutation. Results
are explicit `{ok:true,selected}` or `{ok:false,message}`; components never interpret failure as
successful removal. Pending state is shared; retries reuse the normal action after failure.

Confirmed upload/import callbacks refresh collections. Catalog membership changes update/invalidate
the personal library. Metadata/visibility edits invalidate summaries, content and embedded references.
Confirmed global deletion removes the document and references from loaded caches, invalidates
unloaded caches, and forgets progress. Storage-recovery statuses retain their existing behavior.

Query failures expose Retry instead of an empty collection. Confirmed list data remains visible on
refresh failure. `ReadLaterButton` uses a hook-free conditional wrapper so delayed progress cannot
change its hook order. The reader bookmark icon derives directly from shared state.

## Automated validation

```sh
node --test tests/*.test.ts
npm run typecheck
npm run build
```

Targeted ESLint covers changed source/test files. AuthContext retains its pre-existing Fast Refresh
warning about mixed component/hook exports. Tests cover query subscriptions, request deduplication,
superseded responses, account disposal, mutation gates, failure/retry, metadata projection, generated
counts/redaction/RLS, progress reconciliation and pending-save disposal/deletion.

The database test uses PGlite with Supabase auth/storage shims and actual app migrations. Local
Chromium mounted the actual app plus another mounted hook consumer with controlled Supabase
responses. Checks covered shared requests and mutations, backend failures, repeated actions, refresh
failure retaining data, delayed account-A response after switching to B, metadata-only startup,
on-demand content, content-error retry and no uncaught browser/React errors. These are controlled
checks, not proof of live Supabase or Firefox/WebKit behavior.

## Manual signed-in checks

1. Apply migration, run the app, and open DevTools Network with Preserve log. Initial document lists
   and embedded bookmark/list documents must have metadata and counts, without chapter bodies.
2. Open TXT/PDF/EPUB. Only the selected document should fetch full content; position restoration and
   PDF view persistence must continue working. Block its content request and verify Retry, not empty TXT.
3. Bookmark in the reader and inspect the library and Bookmarks. Toggle Read Later in a table/detail
   view and inspect Reading List. All consumers should agree without a hard refresh.
4. Block bookmark/list POST and DELETE requests. Failure must show an error, retain the confirmed
   state, and permit retry. Throttle and click repeatedly; there must be no competing same-item writes.
5. Block initial library/bookmark/list GET requests. Verify error/Retry instead of a false empty state.
   Fail a later refresh and verify previously confirmed data remains visible.
6. Under throttling, begin loading A, sign out, and sign into B. No private title, collection, selection,
   content, or toast from A may reappear. Repeat while a save or mutation is pending.
7. Select two documents rapidly with delayed content responses. Only the latest selection may render.
   Reopen a previously shared document after access is revoked and verify authorization is rechecked.
8. Upload/import, edit metadata/visibility, remove a catalog membership, and delete an owned document.
   Check affected library, bookmark/list, management and progress caches. Deleted content must not reopen
   from cache. Verify storage-cleanup-pending messaging remains correct.
9. Verify demo stories remain visible without membership; genuine catalog filtering remains; another
   account's private upload stays inaccessible. Locked saved references must remain redacted.
10. Delay progress loading while Read Later is visible for a started book. No hook-order error should
    occur. Check keyboard operation and narrow-screen loading/error states too.

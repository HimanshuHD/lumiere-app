# Reading position persistence (#13)

## Deployment

Apply `20261102001000_version_reading_positions.sql` before deploying this frontend.
For an existing local stack, use `npx supabase migration up --local` (not a destructive reset).
The migration adds nullable versioned `position` JSON, a revision, an idempotency mutation ID,
and the `save_reading_position` RPC. Existing rows remain readable through format-specific
legacy conversion; PDF percentages become pages only after the document page count is known.
Library completion cards continue using the legacy progress columns, which new saves update too.

## Ownership and flow

- `position.ts` defines and normalizes format-specific positions.
- `SaveCoordinator` owns one serialized queue per document within an account-wide store.
- A reading action immediately records a small local pending entry; network writes debounce for 750ms.
- Reader unmount, chapter changes, and pagehide request a flush. Page termination does **not** depend
  on the asynchronous flush: pending entries were already stored synchronously.
- Successful saves remove only the acknowledged mutation. An uncertain acknowledgement can replay
  idempotently. Failures remain locally pending; Retry and the online event attempt synchronization.
- Revision comparison is atomic in PostgreSQL. A conflict never auto-overwrites remote progress.
  “Use this device’s position” explicitly retries against the returned revision. Another conflict
  requires another explicit choice; higher reading percentage is not treated as newer.
- Pending entries and stores are scoped by account and document. The RPC verifies the expected
  user ID as well as preserving owner/document-access RLS, including during account switches.
- A failed initial progress fetch blocks restoration and tracking until Retry succeeds.
- Local-storage failure is visible. If storage is unavailable, a reload or browser termination
  can lose an unsynchronized in-memory position; the UI does not claim otherwise.

## Restoration

TXT restores a bounded chapter and chapter-relative scroll after fonts/layout are ready. Tracking
is disabled until restoration completes. Scroll ranges use window coordinates and the measured
sticky toolbar. Empty chapters have an explicit empty state. Chapter navigation records the new
chapter even if the user does not scroll.

PDF restores an exact page and fit-width/manual scale. Fit width recalculates against current
container dimensions; it does not persist a stale pixel width. Navigation/view changes record
positions directly in the action handler; initialization and URL renewal do not create saves.

EPUB restores a CFI, falling back to the beginning if the target is unavailable. Initial display
and layout-generated relocation events cannot save until a user navigation/click occurs.
The displayed page count is section-local; overall completion is an approximation based on spine
sections, not an exact percentage of words or pages.

## Validation

Run:

```sh
node --test tests/*.test.ts
npm run typecheck
npm run build
npx eslint src/components/Reader.tsx src/components/PdfViewer.tsx src/hooks/useData.ts src/features/reader/progress tests/readerPosition.test.ts tests/readingSaveCoordinator.test.ts tests/textScroll.test.ts
npx supabase test db supabase/tests/reading_position.test.sql
```

The SQL test requires a running migrated local Supabase stack. It checks revision ordering,
idempotent replay, intentional backwards navigation, anonymous execution denial, account identity,
and document-access RLS.

Implementation validation: 102 Node tests, typecheck, targeted lint, production build; embedded
PostgreSQL exercised the migration/save RPC with auth and document-policy fixtures. A local Chromium
harness mounted the actual Reader/AuthProvider/hooks and real PDF.js/epubjs engines with synthetic
books and controlled Supabase responses. It covered TXT reopen/immediate exit; PDF page, manual zoom,
fit mode/mobile reopen; EPUB CFI reopen and invalid target fallback; empty TXT; failure/retry,
local pending replay across reload, conflict handling, and blocked initial progress fetch.
No startup progress writes or uncaught browser errors were observed.

These checks do not establish live Supabase integration or Firefox/WebKit behavior. Run the committed
SQL test on the real local stack and perform the following browser acceptance checks before merging.

## Manual browser acceptance

Use long TXT, multipage PDF, and multi-section EPUB fixtures; preserve the Network log.

1. Reopen each format at a saved location. TXT should not flash at the first chapter; PDF must
   retain page/manual zoom or responsive fit mode; EPUB must restore the CFI.
2. Scroll TXT or turn a PDF page, then immediately leave and reopen. The latest position must survive.
3. Change TXT chapters without scrolling and leave. Reopen that chapter at its start.
4. Throttle the connection and navigate rapidly, including backwards. The latest action wins.
5. Block progress GET requests before startup. The reader must show Retry and send no default save.
6. Block the save RPC or go offline after loading. Move, leave, reload, reconnect, and retry.
   Local pending progress must restore, then sync and clear its pending key after acknowledgement.
7. Open the same book in two tabs. Save in one, then act in the other. The stale tab must show a
   conflict and preserve server progress until “Use this device’s position” is chosen.
8. Put an out-of-range position or invalid EPUB CFI in a local fixture. Expect a bounded location
   or fallback, and no crash. Open empty TXT content too.
9. Change accounts with pending progress. One account's pending entry must never save under another.
10. Check save status on narrow screens and while using keyboard navigation. Simulate unavailable
    local storage and verify that the UI does not promise on-device recovery.

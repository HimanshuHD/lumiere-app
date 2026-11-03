# Architecture refactor validation (#15, first batch)

This is the first reviewable batch, not issue completion. See docs/architecture.md for current and
remaining boundaries, and scripts/architecture-exceptions.json for exact temporary edges.
No database migration, reset or demo reseed is required by this batch. Start from the migrations
already required by main/PR #29.

Run `npm ci`, `npm run check:boundaries`, `npm run typecheck`, `npm run lint`, `npm test`, and
`npm run build`. Boundary tests include negative fixtures; account-store tests inject a fake repository
without importing the SDK or environment. Existing reliability/security tests must continue passing.

Signed-in manual regression checklist:

1. Sign in/reload/sign out/switch account under throttling. Verify identity/profile and collections do
   not leak or reappear from stale work. Failed logout should produce an error, not an unhandled promise.
2. Change profile name/avatar and password; try configured OAuth. Verify existing endpoints, ownership,
   public-avatar behavior and profile refresh. Block writes and confirm truthful errors.
3. Browse/import a catalog edition twice. Verify auth/challenge flow, normalized feed display, canonical
   reuse and membership. Malformed feed JSON should show a controlled error, not a rendering crash.
4. Upload TXT/PDF/EPUB with optional cover, edit visibility/metadata, delete with references, and retry
   cleanup. Check the cache only changes after confirmed persistence and storage recovery remains intact.
5. Open demo TXT, a PDF and an EPUB. Resume positions, rapid page/zoom/chapter changes, resize and exit
   during loading must retain the existing lifecycle behavior. List requests must still omit chapters.
6. Go offline while reading, leave/reload/reconnect and retry. Verify durable pending progress and
   account-scoped replay; test a conflicting revision too.
7. Set localStorage `reader-settings` to invalid JSON or invalid theme/font/spacing values. Reopen TXT:
   it must use safe defaults. Block storage writes: the reader should remain usable and warn that
   preferences could not be saved on this device.
8. Bookmark/read-later add/remove across views, block POST/DELETE, and switch accounts during a request.
   Confirm cache synchronization, failure retention and no late cross-account cache revival.
9. Verify demo labels/visibility, catalog membership filtering, private upload denial, redacted locked
   references and privileged catalog deletion. Backend authorization must not change.

Current automated checks use Node and embedded PostgreSQL fixtures. They do not prove live Supabase,
OAuth, external catalog availability, signed-URL renewal timing or cross-browser behavior.

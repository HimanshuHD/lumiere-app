# 0005 — URL navigation and account-owned reader routes

Status: accepted for issue #16.

The pathname identifies the current view or document. Domain navigation contracts map the existing
fixed view set and UUID document identities; the app's small history adapter subscribes to popstate
and its own navigation event. React state no longer duplicates the authoritative view/document ID.
No routing package is required for this fixed route set. If nested layouts or data-router requirements
grow, replace the adapter while retaining the domain/authorization contracts and regression tests.

Use history paths, preserving /admin/catalog, with Vite's path-only BASE_URL. Hosting must rewrite app
routes to the built entry HTML while preserving real asset/API responses. Hash routing is not used;
OAuth may use a fragment to deliver authentication data. Absolute/CDN bases are outside this strategy.

Reader routes load authorized content by ID, independently of library membership/list availability.
RLS-hidden and nonexistent records share the same unavailable result. Explicit permission errors get
a generic denied message; backend error detail is not rendered. New IDs remount reader resources.

Initial signed-out deep links remain in the URL through email login. Logout, session loss and direct
account changes replace the active route with the library before mounting new account UI. Old history
entries are not erased; visiting them reauthorizes with the current account. Account-keyed stores,
reader cleanup and partitioned pending progress remain authoritative for account isolation.

Google OAuth returns to an app-base-aware callback. Per-tab session storage holds only a validated
internal destination and timestamp, consumed once within ten minutes. Query/fragment/foreign/unknown
destinations are rejected. Auth initialization processes credentials before route cleanup. Failed
callbacks have a sign-in recovery action; unavailable return storage fails clearly instead of losing
the destination silently. Callback completion uses replaceState so Back does not reprocess credentials.

No schema migration, authorization policy change or new reader functionality is introduced.

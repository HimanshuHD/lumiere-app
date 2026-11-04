# URL navigation validation (#16)

## Code ownership

| File | Responsibility |
| --- | --- |
| src/domain/navigation.ts | Pure view/reader/callback route contracts, UUID checks, base normalization and safe return destinations |
| src/app/navigation.ts | History push/replace and React subscription to URL changes |
| src/App.tsx | Existing screen composition and navigation commands; transient modal state stays local |
| src/components/ReaderLoader.tsx | Authorized content loading by route ID, retry/unavailable/denied recovery |
| src/domain/collections.ts | Content port explicitly permits a missing/hidden result |
| src/infrastructure/supabase/user-data-repository.ts | maybeSingle returns null without distinguishing RLS-hidden from missing |
| src/features/data/query-cache.ts | Preserve error categories alongside existing error text |
| src/app/SessionNavigationBoundary.tsx | Gate rendering until authentication and the current identity have settled |
| src/app/session-navigation.ts | Reset navigation synchronously before account cache disposal publishes changes |
| src/app/account-runtime.ts | Mark the new active identity before disposal; reject old-identity store creation |
| src/infrastructure/browser/oauth-return.ts | Validated, expiring, one-use per-tab OAuth destination |
| src/infrastructure/supabase/auth-integration.ts | Provider redirect uses app-base-aware callback |
| src/app/OAuthCallback.tsx | Complete return after auth readiness or offer sign-in recovery |

## Routes and history

Library /; bookmarks /bookmarks; reading list /reading-list; upload /upload; profile /profile;
my uploads /my-uploads; all documents /documents; catalog administration /admin/catalog;
reader /read/:documentId; OAuth return /auth/callback. Unknown or malformed document paths show
page-unavailable recovery. Route IDs contain no document title, content or signed storage URL.

View/document navigation pushes history. OAuth completion and account reset replace the current entry.
The reader's in-app Back/Return action goes to the library; browser Back/Forward follows the actual
history, including a bookmarks/reading-list origin. Re-selecting the same route adds no duplicate entry.
Navigation unmounts readers, invoking existing progress flush/resource cleanup. No backend fetch
cancellation claim is made for already committed mutations.

## Hosting and base paths

Root deployment: npm run build, then deploy dist. A direct request to /read/<UUID>, /profile or
/auth/callback must serve dist/index.html with status 200. Preserve the browser URL; do not redirect
all routes to /. Existing static assets must be served normally, and missing asset/API requests
must not be rewritten to HTML. Hosting providers need their equivalent of an SPA fallback.

Example Nginx root deployment (adapt document root and API handling to your host):

```nginx
root /srv/lumiere/dist;
location /assets/ { try_files $uri =404; }
location / { try_files $uri $uri/ /index.html; }
```

For a subdirectory, use matching Vite commands:

```sh
npm run dev -- --base /shelf/
npm run build -- --base /shelf/
npm run preview -- --base /shelf/
```

Serve the build at /shelf/ and fall back app routes to /shelf/index.html. BASE_URL must be an absolute
path such as / or /shelf/, not ./, an external asset URL, a query or a fragment. Static hosts without
SPA fallback need hosting configuration/support before history-route deployment. Vite preview tests
the bundle and local fallback; it does not prove the production host has correct rewrites.

## OAuth configuration

Google Cloud's provider callback remains the Supabase Auth callback, for example
http://127.0.0.1:54321/auth/v1/callback. The app return URL is a different allowlist entry:
http://localhost:5173/auth/callback (root) or http://localhost:5173/shelf/auth/callback (subdirectory).
Configure the exact app return URLs in Supabase. Local root callbacks for localhost/127.0.0.1 on
5173/5174 are committed in supabase/config.toml; add the exact subdirectory URL there when using one,
and restart the stack after configuration changes. Configure production URLs in the hosted project's
Auth settings before deployment. No Google credentials belong in VITE variables or source control.

Email login preserves the initial requested route without return storage. OAuth uses sessionStorage,
so clearing it or returning in a different tab safely falls back to the library. If it is blocked,
use email login or enable per-tab storage. Do not disable URL validation to restore a destination.

## Automated checks

```sh
npm ci --include=dev
npm run setup:browser
npm run check:db-types
npm run check:boundaries
npm run typecheck
npm run lint
npm test
npm run build
npm run test:browser
```

Navigation unit tests cover route/base parsing, malformed IDs and return-target rejection. OAuth
tests cover one-use/base-scoped intent, expiration, invalid data and cleanup. Query-cache tests cover
permission category preservation. The navigation Chromium test mounts the real app at root and
a production-preview /shelf/ build with synthetic accounts and mocked API responses, including provider redirect capture.
It does not access Google, a live Supabase project or a production host.

## Manual acceptance

1. Visit every route above, refresh, and verify the same screen remains. Open each URL directly in
   a new tab. Verify browser Back/Forward and reader Return behavior.
2. Copy a valid document link into a signed-out tab. No protected content should appear before auth;
   email login and configured Google login should open the authorized document afterward.
3. Test a nonexistent UUID, malformed ID, removed document, another account's private document, and
   an explicit permission failure. None may expose private metadata. Block requests, restore the
   connection and Retry; a missing document must not remain an indefinite spinner.
4. Throttle a document request, navigate away or open another document, then release the old response.
   The old reader must not mount. Navigate away immediately after a reading-position change, reopen,
   and verify existing durable progress behavior.
5. Sign out from a private reader, then sign in as another account. The library must open without
   previous-account content. Browser Back to an old link must reauthorize and stay unavailable to the
   new account. Test direct account changes and session expiration too.
6. Test OAuth success, cancellation, provider error, missing/stale destination and blocked session
   storage. External/modified return destinations must never navigate away from the app.
7. Repeat deep links, refresh, email/OAuth returns and unknown routes with /shelf/. Verify the deployed
   host's rewrite behavior independently; real missing assets must not return entry HTML.

Record actual local/deployed Supabase, OAuth and cross-browser acceptance separately from mocked CI.

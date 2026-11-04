# Application architecture

## Scope and current status

Issue #15 establishes boundaries inside the existing React/Vite application. It does not introduce
microservices, change the UI, or move authorization into the browser. Controller extraction,
integration injection, generated application-schema types, response mappers, command outcomes and
static enforcement are implemented in PR #30. There are **zero migration exceptions**.

Issue #15 is closed after merged implementation/automated-validation reconciliation. Live
Supabase/OAuth/external catalog acceptance is separate and is not implied by that closure.

## Responsibilities and entry points

| Module | Owns | Does not own | Implementation |
| --- | --- | --- | --- |
| App shell/navigation | Providers, views, selected document identity, account composition | Queries or format resources | `App.tsx`, `domain/navigation.ts`, `app/navigation.ts`, `app/SessionNavigationBoundary.tsx`, account/integration/progress runtimes |
| Authentication | Session readiness, identity, sign-in/out, OAuth, password commands | Profile drafts or document authorization | `features/auth` public context contract; `context/AuthContext.tsx` session provider; auth integration port |
| Profile | Profile read state, edit/save workflow, avatar preview cleanup | Session tokens or document storage | `features/profile` public API and injected profile repository |
| Library | Lists, filters, details and collection presentation | Query construction or full-content caching | Library/AllDocuments/Bookmarks/ReadingList views and shared data hooks |
| Document lifecycle | Inspection, upload/import/delete/visibility workflow, recovery identity | Toasts inside services, navigation inside repositories | `features/documents`, pure `services/`, `app/document-operations.ts` |
| Catalog | Feed navigation, cancellation, normalized books and import eligibility | Reader resources or arbitrary server fetching | `features/catalog` public controller; catalog services and transport port |
| PDF reader | Loading, serialized rendering, page/zoom, resize and disposal | Database/progress writes | `features/reader/pdf` public controller and session/queue; PdfViewer is presentation |
| EPUB reader | Book/rendition lifecycle, CFI events, navigation and cleanup | Database/collections | `features/reader/epub` public controller |
| TXT reader | Chapter/layout/scroll state, font/layout restoration, listeners | Database/collections | `features/reader/text` public controller and pure scroll calculations |
| Reader session | Format composition, restore-once coordination, permission gating, position commands | Canvas or EPUB resource ownership | `features/reader/session` public controller; Reader is presentation |
| Reading progress | Pending positions, save serialization, retry/conflict and reconciliation | Drawing or navigation | `features/reader/progress`; injected repository/storage; app owns account registry |
| Preferences | Validated appearance and device-local persistence | Server state or format resources | `features/reader/preferences` pure storage functions; app injects storage |
| Shared user data | Query deduplication, cache generations, mutation gates, invalidation and account isolation | SDK query construction | `features/data` public API and injected UserDataRepository |
| Database repositories | Typed queries and response mapping | Navigation, toasts or cache notifications | `infrastructure/supabase`, generated public-schema contracts and explicit mappers |
| Storage adapter | Upload/removal, signed URLs and account-scoped URL cache | React state or collection membership | Document/profile/storage adapters; signed-URL hook delegates refresh/expiry/retry to an injected session |
| Shared UI | Generic notices and notifications | Feature state or persistence | `shared/ui`; domain-aware covers/bookmarks remain feature presentation |
| Configuration | Validate public browser configuration | Privileged keys or backend environment | `shared/config`; SDK construction only in infrastructure |
| Backend enforcement | RLS/ownership/visibility, upload/catalog validation, remote-fetch restrictions | Browser presentation | `supabase/migrations` and `supabase/functions`, never imported into the browser |

## Dependency rules and composition

Domain contracts depend only on domain contracts: no React, SDK, browser storage, configuration or UI.
Features coordinate domain services and injected ports. Supabase/browser implementations live in
infrastructure; they do not import app, components, contexts, hooks or feature state. Only app
composition constructs concrete integrations. `shared/integrations.ts` contains a React context typed
solely with domain ports; it has no concrete adapter imports. Tests can supply fake ports.

UI calls public feature APIs or application commands. Every feature has an `index.ts` entry; consumers
outside that feature use the entry rather than an internal file. Internal relative imports are allowed.
Reader engine controllers receive typed position callbacks and cannot import progress persistence,
account runtime or shared server-data hooks. The session controller connects those events to progress.

`shared/ui` imports only shared/domain modules and external UI packages. Backend modules and privileged
credentials never enter the frontend graph. Backend authorization remains authoritative even if UI
permission checks are skipped. Pure workflow services remain under `services/`; a folder move alone
would not change responsibility ownership.

## State ownership and asynchronous lifecycle

| State/resource | Owner and lifetime |
| --- | --- |
| View/selected document | URL pathname via the app history adapter; document IDs resolve authorized content on demand |
| Session | AuthProvider's single subscription, with late-initial-session guard and unsubscribe on unmount |
| Profile display state | Profile data controller; account identity and request generation reject stale reads |
| Server metadata/collections | AccountDataStore and immutable QueryCache snapshots; one store per account |
| Transient PDF/EPUB/TXT state | Format controller; effects release render tasks, rendition/book, listeners, observers and frames |
| Restore-once state | Reader session controller, keyed by account/document; acknowledgements do not restore again |
| Pending reading positions | SaveCoordinator with account-scoped durable browser storage |
| Appearance | Preferences feature; existing device-wide storage key retained |
| Menus/password visibility/form drafts | Local UI/controller state, never authoritative server state |
| File preview URLs | Profile/upload controller; revoked on replacement and unmount |
| Catalog requests | Catalog controller AbortController; back/close/new selection abort obsolete requests |

Query generations prevent late fetches overwriting newer requests or mutations. Cache disposal aborts
reads and clears snapshots/listeners. Mutations share per-item gates, update only confirmed state, and
cannot revive disposed account caches. AuthProvider notifies the app account runtime before exposing a
new session; account changes dispose both data and progress stores. Online/pagehide handlers flush or
retry only the active account. Pending positions for other accounts remain partitioned on disk.

PDF session/queue own loading/render cancellation and serialized canvas writes. EPUB callbacks guard
against disposed sessions, and cleanup destroys rendition and book. In-flight EPUB file requests are
deduplicated by URL and removed on settlement; resource creation is suppressed after cancellation.
TXT restoration waits for fonts and layout, cancels frames on disposal, and suppresses saves until
restoration finishes. No engine performs database mutations.

Upload selection generations suppress late document inspection. Cover selection generations and mount
guards prevent obsolete previews. A completed upload/import remains persisted after a view closes,
but stale UI callbacks do not navigate or update a different account. Security challenge cancellation
removes its widget/timer. Profile reads use both account and generation guards.

## Workflows

- Upload: form -> upload controller -> validated format inspection -> pure upload lifecycle service ->
  storage and finalization adapters -> backend validation -> mapped document -> shared refresh.
  The operation ID survives retries; cleanup/reconciliation records retain their prior recovery behavior.
- Catalog: browse controller -> injected feed transport with auth/challenge -> runtime-normalized feed.
  Import eligibility/canonical identity pass to pure import/collection services and backend validation.
  Obsolete feed responses cannot overwrite a newer selection or a closed modal.
- Open: summary ID -> account repository content query -> backend RLS -> runtime-mapped chapters ->
  reader session -> format controller. Lists omit chapter bodies; opening revalidates access/content.
- Progress: typed engine event -> session -> coordinator -> durable pending storage -> serialized
  repository RPC -> validated acknowledgement -> saved/retry/conflict state. Initial restore is separate.
- Delete/edit visibility: impact/confirmation UI -> pure lifecycle service -> adapter/backend -> app
  command invalidates the captured account cache after success and forgets removed progress.
- Profile: local draft -> typed feature command -> profile adapter -> guarded display refresh. Password
  changes use the auth port. Repositories never display notifications or navigate.

## Contracts and failures

`ServiceResult<T>` is `{ok:true,value:T}` or `{ok:false,error:ServiceError}`. Auth commands, collection
toggles, preferences and feature command boundaries use it. `attempt` normalizes rejected SDK/network
operations; controllers can use `requireValue` to share their presentation error path. Low-level
repositories and pure lifecycle service internals may reject; their callers normalize at the command
boundary rather than nesting results at every internal call. Queries expose error snapshots.

Categories distinguish cancellation, validation, permission, network and unexpected failures.
Document validation and lifecycle errors preserve their subtype/recovery data through normalization.
Cancellation is not a user-facing failure for obsolete work. Services own neither toasts nor navigation;
controllers/views decide how to present outcomes. Do not render underlying privileged causes.

Public-schema types are generated by `npm run db:types`: PGlite applies every actual migration, then the
generator inspects PostgreSQL tables, columns, defaults, generated columns, relationships and RPC
signatures. Only platform auth/storage scaffolding is supplied by `scripts/schema-platform-fixture.sql`.
This does not introspect a deployed project or generate platform-owned schemas. The migration digest
and `npm run check:db-types` detect drift; generated columns cannot be inserted/updated in typed queries.

Database types cannot validate network JSON. Explicit document/summary/reference/progress mappers
validate rows, discard unexpected properties, check chapter shapes and require real acknowledgements.
Summaries never carry chapters. Profile and lifecycle response checks retain their adapter ownership.
Catalog feeds and persisted settings validate input; invalid preferences fall back property by property.
A preference write failure warns without crashing the reader. Position contracts remain format-specific.

## Enforcement and validation

`npm run check:boundaries` uses TypeScript resolution for relative/alias imports, re-exports, literal
dynamic imports and require calls. It rejects forbidden layer edges, SDK/client imports outside
infrastructure, reader-engine persistence ownership, prohibited feature internals and runtime cycles.
Type-only imports obey layer rules but are excluded from runtime cycle detection. Computed import
paths are outside this static check's scope. The exception list is empty; stale exceptions fail.

CI runs schema drift checks, boundaries, TypeScript, lint, Node tests, production build and the isolated
Chromium architecture smoke test. The latter uses mocked transport and generated PDF/EPUB fixtures,
not a real account. See `docs/development/architecture-refactor-validation.md` for reproduction and
live/manual acceptance. Issue closure does not substitute for live-provider acceptance.


## Signed-URL recovery ownership (#32)

`features/documents/signed-url-session.ts` receives transport and owns bounded refresh/retry plus independent
expiry. The URL hook owns the online listener and disposes the session on path/enable changes. The
adapter supplies conservative expiration metadata. Transient failures may retain only unexpired URLs;
permission failures clear access. See `docs/development/async-lifecycle-regressions.md` for the exact
retry policy and catalog/avatar ownership regression checks.


## URL and session navigation (#16)

Domain route contracts define the existing views and UUID reader IDs. The app history adapter owns
push/replace/popstate subscriptions; components issue navigation commands instead of duplicating view
or document identity in React state. Transient overlays remain local and close on route changes.
ReaderLoader fetches authorized content by route ID, independently of library-list membership. Missing
and RLS-hidden records share an unavailable response; the cache retains error categories for recovery.

The session-navigation composition resets the URL before cache disposal notifies subscribers.
SessionNavigationBoundary waits for auth readiness before mounting the new account; inactive identities
cannot create account/progress stores through the UI hooks. Initial signed-out links survive email login; old history links reauthorize with the current
account. OAuth returns through a base-aware callback and consumes a validated expiring per-tab target.
See docs/decisions/0005-url-navigation.md and docs/development/url-navigation.md for ownership, hosting,
return security and validation. No policy or database migration is introduced.

## Adding code

Put independent models/ports in domain; workflow controllers in the owning feature; concrete transport
in infrastructure; account wiring/invalidation in app; engine resources in the matching reader feature;
and generic presentation in shared UI. Inject ports in orchestration tests. Update the architecture,
relevant ADR and boundary fixtures with material dependency changes. No empty modules or broad exceptions.

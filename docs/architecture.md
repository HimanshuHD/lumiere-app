# Application architecture

## Status and scope

Issue #15 is incremental. This first batch establishes independent contracts, integration modules,
a repository port for shared user data, public feature entry points, static dependency enforcement,
and CI. It does **not** complete #15. The remaining controller extractions, schema-generated database
types/mappings, error-contract migration, and removal of tracked integration exceptions remain open.
No UI redesign, route redesign, or backend authorization changes are included.

## Responsibilities and current-to-target map

| Boundary | Owns | Does not own | Current implementation / next extraction |
| --- | --- | --- | --- |
| App shell/navigation | Page/layout/provider composition and selected document identity | Persistence queries or reader resources | `App.tsx`, `app/account-runtime.ts`, `app/document-operations.ts`; route recovery stays with navigation work |
| Authentication | Session readiness, identity, sign-in/out, OAuth, password commands | Profile presentation or document access authorization | `context/AuthContext.tsx` plus `infrastructure/supabase/auth-integration.ts`; profile/controller split pending |
| Profile | Profile display data and edit workflow | Session tokens or document storage | `components/Profile.tsx`, `profile-repository.ts`; feature controller/port pending |
| Library | Lists, filters, details, collection presentation | Query construction or full-content ownership | Library/AllDocuments/Bookmarks/ReadingList components consume shared hooks and domain summaries |
| Document lifecycle | Upload/import/delete/visibility orchestration and partial-failure recovery | Toasts, navigation, or form drafts | Pure `services/documentLifecycle.ts`, deletion/visibility services, `app/document-operations.ts`; upload inspection extraction pending |
| Catalog | Feed normalization, canonical identity, import eligibility | Reader engines or arbitrary remote network access | `domain/catalog.ts`, pure catalog services, `infrastructure/supabase/catalog-*.ts`; browsing controller pending |
| PDF | Loading tasks, serialized canvas rendering, page/zoom, disposal | Database or progress persistence | `features/reader/pdf` public API; PdfViewer presentation/controller split remains |
| EPUB | Book/rendition ownership, CFI/location events and disposal | Database or collections | Still in Reader.tsx; extract a dedicated controller in the next batch |
| TXT | Chapter/layout/scroll behavior | Database or upload workflow | Reader.tsx plus `features/reader/text`; controller extraction pending |
| Reading progress | Position restoration, durable pending actions, save scheduling/retry/conflict state | Drawing, navigation, or toast ownership | Domain position/progress contracts, `features/reader/progress`; runtime dependency injection remains tracked |
| Reader preferences | Validated settings and device-local persistence | Server state or rendering resources | `domain/reader-preferences.ts`, `features/reader/preferences`, browser adapter; theme classes stay presentation-side |
| Shared user data | Cache, deduplication, mutation locks, invalidation, account disposal | Supabase query construction | Pure `features/data/AccountDataStore` receives `UserDataRepository`; app runtime wires the implementation |
| Database repositories | Queries, transport mapping and response validation | Navigation, toasts or cache notifications | `infrastructure/supabase`; complete generated schema types/mappers are follow-up work |
| Storage adapters | Object upload/removal and authorized URLs | React state or library membership | Document lifecycle/storage/profile adapters under infrastructure; signed URL hook only subscribes/schedules |
| Shared UI | Generic notices and notifications | Feature logic, auth or persistence | `shared/ui`; domain-aware cover/bookmark/demo controls remain feature presentation |
| Configuration | Validate public browser configuration | Privileged credentials or backend configuration | `shared/config`; only infrastructure creates the Supabase SDK client |
| Backend enforcement | Ownership/RLS/visibility, validated uploads/catalog import, remote-fetch restrictions | Browser presentation or cached state | SQL migrations and `supabase/functions`; never imported into browser modules |

## Dependency direction and public APIs

Domain contracts import only other domain contracts. They do not import React, SDKs, environment
configuration, browser storage, feature implementations, or UI. Document/summary/collection/position/
progress/auth/error/preference/catalog contracts live under `src/domain`.

UI consumes feature APIs or application commands. Feature controllers coordinate domain services
and ports. Infrastructure implements persistence/transport/browser-storage operations. Composition
roots wire concrete adapters and cache notifications. Infrastructure must not import app, feature,
component, context, or hook modules. In particular, successful database writes do not notify caches
inside the adapter; `app/document-operations.ts` owns that coordination and captures the active account
before awaiting an operation.

Public feature entries are `features/data`, `features/reader/pdf`, `features/reader/progress`,
`features/reader/text`, and `features/reader/preferences`. Outside consumers import those entries;
relative internal imports remain allowed within the same feature. The legacy `services/` directory
currently contains pure orchestration and port contracts; moving it is not required to prove ownership.

`src/shared/ui` imports only shared/domain modules and external UI packages. Domain-specific controls
are not moved there merely because several pages use them. `src/shared/config` contains public
configuration validation; private keys, backend environment and privileged APIs never belong there.

## State and asynchronous ownership

| State/resource | Owner |
| --- | --- |
| Current page and selected document | Account-keyed app shell; summary selection identifies the reader by ID |
| Server metadata and personal collections | AccountDataStore and immutable QueryCache snapshots |
| Rendering resources and transient page state | Format controller/session; remaining Reader.tsx extraction is tracked |
| Pending reading positions and persistence status | SaveCoordinator / ProgressStore |
| Reader appearance | Preferences feature; existing device-wide storage key is retained |
| Open menus, modal state, form drafts and file previews | Local presentation components |
| Supabase session subscription | Auth integration with current runtime consumers; subscription consolidation is pending |

Query generations and AbortController prevent late fetches overwriting a mutation, newer request, or
new account. Disposal aborts requests, clears visible snapshots and stops old queues; local pending
progress remains scoped to its original account. Mutations share a per-item gate and update confirmed
state only after persistence succeeds. A completed prior-account operation cannot revive a new cache.

PDF task/canvas ownership remains with PdfSession/PdfRenderQueue. EPUB book/rendition and TXT scroll
listeners retain their existing cleanup in Reader.tsx until extracted; this batch does not change
that lifecycle. Object-preview cleanup remains with the upload/profile view that creates the preview.

## Workflow and failure propagation

- Upload: form draft -> upload orchestration -> storage/database adapters -> backend finalization ->
  typed document -> shared collection refresh. Recovery records and partial storage cleanup retain
  their existing behavior. Format inspection still needs extraction from UploadPanel.
- Catalog browse/import: view requests feed through catalog transport; the adapter supplies auth or
  challenge headers, parses untrusted JSON, and returns normalized books. Import orchestration uses
  catalog adapters; canonical identity and server restrictions remain authoritative. The view/controller
  split and its cancellation ownership remain follow-up work.
- Open: summary selection -> account-bound repository content request -> authorization/RLS -> reader
  composition after validation. Reopening revalidates content; unloaded content is never an empty array.
- Progress: typed position event -> coordinator -> account-scoped pending storage -> serialized save
  repository/RPC -> acknowledge or show retry/conflict. Engines do not import the database client.
- Delete: impact confirmation -> privileged owner/catalog deletion operation -> application cache
  invalidation and progress forgetting -> storage cleanup/recovery. Failed writes do not notify caches.
- Profile: draft -> profile persistence adapter -> refreshed profile; password/session integration
  remains isolated in the auth adapter. Full profile workflow controller extraction is pending.

`ServiceError` and `ServiceResult` establish error categories: cancellation, validation, permission,
network and unexpected. Existing lifecycle errors and collection toggle results are retained until
an explicit consumer migration; do not hide them with generic casts. Repositories may throw transport
failures; UI-boundary result normalization is currently incremental. Cancellation is distinct from a
user-facing failure. Backend-only causes/credentials must never be rendered in notifications.

Preferences parse every supported property and discard invalid values, falling back individually.
Malformed JSON is recoverable. Storage write failure produces a visible warning instead of crashing
the reader. Catalog feed parsing validates the response envelope before rendering. Runtime validation
of every database/edge-function response and generated database typing are not yet complete.

## Authorization and configuration

The browser uses public Supabase configuration only. Configuration rejects malformed URLs and known
privileged key formats without logging their values. This is defense in depth, not a replacement for
secret management or backend enforcement. Domain auth sessions expose identity, not access tokens.

RLS, owner IDs, document visibility constraints, canonical catalog validation, upload finalization and
remote-fetch restrictions remain in the backend. Shared demos remain ownerless authenticated content;
real catalog imports still require personal collection membership to appear in the library; private
uploads and redacted references preserve the prior security contract. No SQL migration is introduced.

## Automated checks and temporary exceptions

`npm run check:boundaries` resolves static imports, re-exports, literal dynamic imports and require calls
using the TypeScript resolver, including `@/` and relative paths. It rejects domain dependencies on
other layers, SDK/client imports outside infrastructure, infrastructure-to-feature dependencies,
shared-UI dependencies on feature/persistence code, cross-feature internal imports, backend modules
in the browser graph, and runtime import cycles. Negative tests exercise prohibited imports and cycles.

The checker is not a whole-program security proof and cannot resolve arbitrary computed import paths.
Type-only edges are checked for layer rules but excluded from runtime cycle detection.

Ten remaining direct feature/UI-to-adapter edges are listed individually in
`scripts/architecture-exceptions.json`, with issue #15 and a concrete removal condition. No new edge
is permitted implicitly. Unused/stale exceptions fail the check. These are controller-injection
migration steps, not permission to import the SDK client from UI or to add broad folder exemptions.

CI runs boundaries, typecheck, full lint, all Node tests, and production build on PRs and main pushes.
The Node version is pinned to 24 for the existing TypeScript test execution. Live Supabase and browser
acceptance remain separate validation requirements.

## Remaining #15 work (issue stays open)

- Extract EPUB/TXT controllers and the PDF presentation/controller split, keeping typed position events.
- Extract upload format inspection and catalog/profile controllers; remove the ten tracked adapter edges.
- Consolidate auth/profile/session composition and progress/preference dependency injection.
- Generate database schema types from the authoritative migrated Supabase schema; add explicit row/RPC
  mappers and complete runtime validation rather than hand-authoring a purported generated snapshot.
- Migrate service consumers to consistent typed outcomes; then remove temporary result compatibility.
- Revalidate real signed-in upload/import/read/resume/collection/profile/session and cleanup flows.
- Keep this document and the four decisions below synchronized with each subsequent batch.

## Where future code belongs

Add independent contracts to domain; pure workflow logic/ports to the owning feature or service;
Supabase and browser implementations to infrastructure; wiring/invalidation to app composition;
format resources to the corresponding reader feature; generic presentation to shared UI. Tests for
contracts and orchestration should inject ports. Add/update boundary fixtures when introducing a new
public module or dependency rule. Do not introduce empty modules simply to reproduce a folder diagram.

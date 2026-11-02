# Generated demo stories (#27)

## Why they disappeared

The ownership/security migration grouped nine known historical document IDs as catalog imports:
eight generated text stories and one uploaded PDF. The later library-membership rule correctly hides
catalog imports that a user has not added, but the generated stories never received memberships.
A fresh local database also has no sample content because seed `sql_paths` is intentionally empty.

The running database on the developer's machine was not accessible during implementation. Run
`supabase/snippets/demo_data_status.sql` in the local Studio SQL editor to distinguish existing but
misclassified stories from missing stories. It reports each expected ID, classification, chapter count,
and aggregate reference counts without disclosing other users' activity details.

## Explicit demo model

`origin = 'demo'` means ownerless, shared text content available to signed-in users. It is not a
catalog import and never requires catalog collection membership. Database constraints require TXT
format, nonempty chapters, no owner, no source identity/URL, and no file/storage references.

Existing authenticated SELECT policy already admits shared documents. Document update policies
admit only owned `user_upload` rows; ordinary document insert/delete operations are restricted by
existing policies and privileged lifecycle functions. None are broadened for demos. Demo content
management is a privileged database/service-role operation; the catalog maintenance UI/API is still
restricted to genuine `catalog_import` rows. Anonymous content access stays denied.

Migration `20261102001100_classify_generated_demo_stories.sql` targets only these verified IDs:

| ID | Generated story |
| --- | --- |
| `4350bfc7-cd8c-4725-9d1b-9051c7a32866` | The Silent Observer |
| `5f85fae3-360a-45d9-a9cb-513c302e079e` | Beyond the Horizon |
| `77123519-4519-4883-9e24-b728caec341a` | Echoes of Empire |
| `54c48967-1e6d-4d4c-8e9c-3d231b20f29b` | The Art of Stillness |
| `e488bba3-8393-4b5b-8070-be2ac30da5ae` | Into the Wild Green |
| `c2c801f8-e2c7-4390-a592-db1900526a70` | The Digital Mind |
| `b3bcd430-e854-45bf-86df-eb7251fb2d82` | Whispers of the Heart |
| `666d33ce-a9a8-4d2c-9d63-483188180020` | The Mountain Within |

The ninth ID, `06e6e69a-302a-4763-8cd6-47eae64b0dd9`, is a legacy uploaded PDF and is excluded.
Migration guards skip unexpected owned, file-backed, source-identified, or empty records for operator
review. Existing chapter content, titles, IDs and personal references are never replaced. Migration
011 does not add missing stories or rewrite earlier migrations.

## Opt-in local setup and recovery (no reset)

With Docker and the local Supabase stack running, from the repository root:

```sh
npx supabase migration up --local
npm run supabase:seed:demo
```

The cross-platform Node command passes `supabase/seeds/demo.sql` to `psql` in the local
`supabase_db_lumiere-app` container (name derived from `project_id` in config.toml). It uses no hosted
connection, app key, or imported account. Errors stop the command and set a failing exit status.

The transaction inserts missing demo stories with stable IDs and `ON CONFLICT DO NOTHING`.
Repeated runs preserve existing content and personal references. A conflicting non-demo ID aborts
and rolls back the transaction instead of overwriting it; inspect the diagnostic query before retrying.
The seed contains only intended story metadata/chapters. Accounts, profiles, personal activity,
legacy PDF content, remote covers and original-project storage references are omitted. Covers use the
existing local fallback image; no remote image/file is needed to read a story.

Demo seeding is **explicit**, including on fresh databases: config `sql_paths = []` remains unchanged.
Production loading is an explicit operator decision using the reviewed seed SQL and privileged
connection after migration. Never load the complete historical dump to restore demo stories.

## Origin-dependent behavior reviewed

| Area | Demo behavior |
| --- | --- |
| Domain `Document.origin` and origin/owner constraints | Dedicated `demo` value and strict shared text shape |
| `useDocuments` / `selectLibraryDocuments` | Include shared demos; catalog membership filtering remains |
| Catalog collection service and membership insert policy | Reject demos; genuine catalog imports only |
| Upload edit/visibility/deletion services and RPCs | Demos are not owned uploads and cannot enter these paths |
| Catalog import lookup, deletion RPC and admin UI | Remain restricted to catalog origin; demos excluded |
| Storage policies and cleanup helpers | Demos have no file/storage references |
| Locked-reference RPC | Continues to target other users' private uploads only |
| Bookmarks, progress and reading list | Normal user-owned references to shared documents |
| Library cards/tables/details, bookmarks/list, text reader | Consistent “Demo story” label |

## Validation and manual checks

```sh
node --test tests/demoDocuments.test.ts tests/demoDataDatabase.test.ts
node --test tests/*.test.ts
npm run typecheck
npm run build
```

Database tests use embedded PostgreSQL (PGlite) with Supabase-provided auth/storage schema shims;
all app migrations, RLS policies and RPCs are the real repository SQL. They cover existing-record
migration, content/reference preservation, repeated and atomic seeding, new/existing account reads,
anonymous denial, forbidden mutations, bookmarks/list/progress, and private-upload isolation.
They do not replace a signed-in check against your running Supabase stack.

Implementation validation passed all 107 Node tests, typecheck, targeted ESLint, and a production
build. A local Chromium harness mounted the actual app with controlled Supabase responses based
on the sanitized seed. It verified all eight stories, detail/reader/table/bookmark/reading-list labels,
TXT chapter navigation and saving, catalog membership filtering/removal, and mobile-width labels.
No uncaught browser errors were observed. The local Docker seed command's missing-Docker failure
path was checked; executing it against a running Supabase stack remains a developer acceptance check.


1. Run the diagnostic query before and after migrations/seeding. All eight rows should be `ready`
   with four chapters; existing personal reference counts should remain unchanged.
2. Run the seed twice. There should still be eight demos, with no duplicate titles/IDs.
3. Sign in with an existing account, then a newly created account. All eight stories should appear
   without adding catalog memberships and should display “Demo story”.
4. Open a story, navigate chapters, save progress, leave and reopen. Bookmark and add another story
   to the reading list; verify labels there and in the library details modal/table.
5. Verify demos have no personal upload edit/global delete or catalog remove-from-collection control.
6. Verify a genuine catalog book still requires personal collection membership. Remove that membership;
   the catalog book should disappear from your library while demo stories remain visible.
7. Verify another account cannot read a private upload. Check browser Console/Network for failures.

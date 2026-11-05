# Core-flow quality validation (#18)

## Fast validation

Use Node.js 24 and `npm ci --include=dev`. Run `npm run check:db-types`,
`npm run check:boundaries`, `npm run typecheck`, `npm run lint`, `npm test`,
`npm run build`, `npm run setup:browser`, then `npm run test:browser`.
CI runs these on every PR and main push. `build` alone does not typecheck.

The four browser suites use synthetic accounts, local PDF/EPUB/TXT fixtures and mocked
Supabase/catalog transport. They do not depend on public catalog uptime. Coverage includes
reader restoration, account changes, lifecycle failures, deterministic repeated imports,
navigation, forms, focus and accessibility. Mocked import reuse checks the frontend contract;
canonical database membership/identity behavior is additionally tested by SQL/service tests.
Live catalog compatibility and real Google OAuth remain separate manual checks.

On failure, `test-results/browser/<suite>/` contains context screenshots, a Playwright trace,
and bounded console/network diagnostics. Successful suite artifacts are removed. CI retains
failure artifacts for three days. Inspect a trace with `npx playwright show-trace <trace.zip>`.
These traces contain synthetic transport only; do not reuse tracing against personal accounts.
A forced process/browser crash can prevent final screenshots/trace closure; the job log remains.

## Disposable real Supabase validation

Docker must be running. This stack has project ID `lumiere-quality-test`, API port 55321 and
database port 55322, separate from the normal developer stack. The preparation script copies
committed migrations/functions and disables Google only in the generated test config.
Do not edit the generated config to point at a hosted database.

```sh
node scripts/prepare-test-stack.mjs
npx supabase start --workdir .test-stack
npx supabase db reset --local --workdir .test-stack
npx supabase test db --workdir .test-stack
```

The reset destroys ONLY this disposable stack's data. SQL tests cover owner/other-user/anonymous
access, catalog memberships, cleanup, upload restrictions, deletion, rate limits and reading
position writes. Migration replay tests embed the exact migration at preparation time because
the CLI pg_prove container mounts tests without the adjacent migrations folder.

In a second terminal, serve the test functions:

```sh
npx supabase functions serve --no-verify-jwt --workdir .test-stack
```

Then run:

```sh
node scripts/wait-test-functions.mjs
node tests/browser/local-supabase.mjs
```

This test obtains local keys internally from CLI status; it accepts only loopback port 55321.
It creates two temporary confirmed users, signs in through the real app, uploads TXT through
Storage and the finalizer, verifies chapter resume/bookmarks, personal Reading List isolation,
shared/private document and signed-file access, forged-PDF rejection and sign-out. No browser
network routes are mocked in this test. It deliberately does not record auth-token-bearing traces.
The test cleans up its own records/objects/users. Stop the function server, then:

```sh
npx supabase stop --no-backup --workdir .test-stack
```

`--no-verify-jwt` is limited to this local test invocation. The upload function still validates
the caller with Supabase Auth itself. Do not change deployed gateway verification as a workaround.

## Normal local OPDS development

Use the normal stack (`npm run supabase:start`) for app development. Follow
`supabase/SECURITY_DEPLOYMENT.md` for Turnstile test keys and `supabase/functions/.env`.
Serve functions with `npx supabase functions serve --env-file supabase/functions/.env`.
The OPDS function's committed gateway configuration permits its own authenticated/Turnstile
authorization paths; keep those checks enabled. Supabase supplies backend connection keys to
the local runtime. Never put server secrets into frontend `VITE_` variables.

## Deployment and GitHub Pages

Lumiere is a React/Vite static frontend, so its built `dist` can be hosted on GitHub Pages.
Auth, PostgreSQL, Storage and Edge Functions must run separately, for example on hosted Supabase.
Use the hosted HTTPS API/public anon or publishable key at build time. Local loopback URLs cannot
serve remote visitors. Server/service-role secrets never belong in a frontend build.

For a repository site build with `npm run build -- --base=/lumiere-app/`; a root custom domain
uses `/`. The app's routing already handles a configured base, but Pages does not supply the SPA
rewrite expected by `/profile`, `/read/<id>` and `/auth/callback`. A tested route fallback (including
preserving OAuth query/hash data), or a separate routing change, is required before deployment.
Do not switch blindly to hash routing because implicit OAuth also uses the fragment.

Configure the final app callback in Supabase's redirect allowlist, keep Google's provider callback
pointing at Supabase, and configure production Turnstile hostname/site key and function secrets.
Verify direct links, refresh, sign-in return, PDF/EPUB workers and signed files under the final base.
No Pages deployment workflow or public publishing is introduced by #18.

# Dependency review — 2026-11-05

The original lockfile reported 26 affected packages: 1 critical, 16 high, 7 moderate and 2 low
using `npm audit --json`. These are registry classifications, not proof of application exploitability.

## Targeted changes

- Refreshed compatible lockfile resolutions with npm's non-force audit repair.
- Vite 5 -> 6.4.5 and React plugin 4.7: use the security-supported Vite 6.4 line without adopting
  the newer Rolldown/plugin migration. https://vite.dev/releases documents support.
- PDF.js 4.4.168 -> 4.10.38: retain the version-4 integration, remove its obsolete optional
  canvas installation chain and pass the new AnnotationLayer structTreeLayer option explicitly.
- EPUB.js stays at 0.3.93. Its nested @xmldom/xmldom is overridden to 0.9.12; this changes parsing
  implementation, so the EPUB fixture/browser test is an explicit regression gate.
- Refreshed ESLint/TypeScript-ESLint/Tailwind resolutions within the existing declared major ranges.

After these changes the full audit reports 9 moderate findings and no high/critical findings.
They are build/lint tool chains: TypeScript-ESLint -> minimatch and Tailwind/Sucrase -> glob/minimatch.
The runtime-only audit is run separately; do not interpret development findings as browser bundles.

## Remaining scope and decision

- https://github.com/advisories/GHSA-g3hv-75wg-m249 — minimatch pattern amplification.
- https://github.com/advisories/GHSA-3g3m-2fjr-6pw4 — glob cancellation/traversal.

These tools process repository-controlled patterns/files in the current CI, rather than uploaded
books or remote catalog patterns. No forced transitive major override is introduced: that would
change filesystem/glob APIs outside their consumers' supported ranges. Review patched compatible
tooling releases again before changing this decision. This is a documented residual, not a zero-
vulnerability claim. Do not enable these development servers/tools as public production services.

Reproduce with `npm ci --include=dev`, `npm audit --json` and `npm audit --omit=dev --json`.
Registry results can change. Never run `npm audit fix --force` as a routine CI repair.
Validation includes typecheck, lint, boundaries, migrated DB contracts, unit/build checks and
the full browser suites. Real manual source-document acceptance remains separate.

The frontend npm audit does not automatically cover Deno imports. A separate temporary npm manifest
was audited for the Edge Functions' exact npm imports: Supabase JS 2.57.4 and fast-xml-parser 4.5.7
(updated from 4.5.3). Function SDK imports are pinned rather than floating on major version 2.
This reports one moderate XMLBuilder delimiter-injection advisory, GHSA-gh4j-gqv2-49f6. The OPDS
function imports only XMLParser/XMLValidator and does not construct XML with XMLBuilder. The
advisory's affected builder path is therefore unused here; no parser-major migration is forced.
Reproduce this separate review using an isolated npm manifest with those two exact dependencies.
Docker images, credentials and deployed infrastructure were not comprehensively scanned.

The upload finalizer's TXT parser lives under `_shared`. A parity regression checks that server TXT
sections match browser previews. This copy is deliberate across independently deployed runtimes.
The existing upload validation helper still imports pure validation/domain contracts from `src`;
the disposable test preparation includes those sources. No claim is made that all function imports
are independent of the repository source tree.

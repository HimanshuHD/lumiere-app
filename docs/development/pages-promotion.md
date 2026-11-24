# Deploying Lumiere to GitHub Pages

| Environment | Address | What it serves |
| --- | --- | --- |
| Production | [Live Lumiere](https://himanshuhd.github.io/lumiere-app/) | The last published release or hotfix |
| Staging | [Lumiere staging](https://himanshuhd.github.io/lumiere-app/staging/) | The last published staging merge |
| Preview | [Lumiere preview](https://himanshuhd.github.io/lumiere-app/preview/) | One developer-selected build, or an expiry notice after that verified change reaches staging |

## Set up GitHub and Supabase

1. Set **Settings → Pages → Build and deployment → Source** to **GitHub Actions**. In **Settings → Environments → github-pages**, permit deployments from `main`. Configure GitHub rules so the Actions publisher can update `pages-prepared` and `pages-state`.
2. Set repository Actions variables `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` to the shared hosted project's HTTPS origin and browser-safe publishable or anon key. The hosted deployment job also needs `SUPABASE_PROJECT_REF`, `SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD` through the `supabase-hosted` environment or the corresponding repository Actions configuration.
3. In Supabase **Authentication → URL Configuration → Redirect URLs**, allow the exact paths `/lumiere-app/auth/callback/`, `/lumiere-app/preview/auth/callback/`, and `/lumiere-app/staging/auth/callback/` on `https://himanshuhd.github.io`. Keep the pilot site URL and admission settings.
4. Protect `staging` and `main` with PR requirements and up-to-date branches. Require application and database validation on both. On `staging`, select the successful reusable **preview / build** check shown by the updated application workflow for same-repository PRs and require **Preview verified**. On `main`, require **Check PR source** and the standalone **Build Lumiere for Pages** check. Use the actual GitHub check names after a ready PR runs. During rollout, update staging's required Pages check when the new preview check becomes available.
5. A change to the trusted publisher takes effect when it reaches `main` through a release PR. Until then, the manual dispatcher on `main` runs the previous implementation. The initial publisher can seed state from Pages run [45232260842](https://github.com/HimanshuHD/lumiere-app/actions/runs/45232260842) after comparing the root and preview HTML to the live site. Subsequent updates use the retained deployment state.

## Open, preview, and verify a PR

1. Branch from `staging` and open a draft PR targeting `staging`. Drafts skip expensive jobs. A ready same-repository staging PR runs the application and disposable Supabase checks on GitHub's proposed merge commit. After both pass, the same run builds for `/lumiere-app/preview/`, smoke-tests the emitted site in Chromium, and uploads the result. A ready PR to `main` runs the release checks and a build for `/lumiere-app/`.
2. Go to **Actions → Promote Lumiere Pages → Run workflow**. Select `main` under **Use workflow from**, then choose **Deploy** and a source.

   | Source type | Enter | What it deploys |
   | --- | --- | --- |
   | PR | A number such as `83` | GitHub's current proposed merge for the ready PR. |
   | Branch | A branch name | The ready PR for the branch tip. |
   | SHA | A full 40-character SHA | The ready PR matching the current head or proposed merge SHA. |

3. The publisher requires a successful ready-PR run that tested the current head and base, using the current public Supabase config and trusted validation workflows. Preview publishes the resulting artifact. If the artifact is missing, stale or expired, rerun the ready PR's validation in Actions and then retry the deployment. The publisher rechecks the selected source before replacing the preview.
4. Open the **Preview published** link in the summary and review the app. Run the workflow again with **Verify preview → SHA** and the full source commit or built revision from the summary. Verification checks that this is the active preview and, for PR previews, that the PR head and tested PR base are current. The verification run records **Preview verified** on the PR head and ties the sign-off to the active preview deployment. Deploy and recheck whenever the head or base changes.

## Promote to staging and production

- **Staging.** Merge a verified PR to `staging`. **Queue merged Pages change** signals the trusted publisher, which validates and builds the resulting staging commit for `/lumiere-app/staging/`. The publisher records staging and expires the matching verified preview in the same Pages publication. The preview address then shows a static Lumiere notice with links to staging, production, and the PR and referenced issues when available. Issue #84 is the fallback reference for a change without an issue link in the PR body. An unrelated preview stays available. The next preview deploy replaces the notice.
- **Production.** After accepting staging, branch `release/*` from the deployed staging revision and open a ready PR to `main`. The release contents must match deployed staging. For an urgent change, branch `hotfix/*` from `main`, validate and preview it, then bring the merged fix back into staging. An eligible merge to `main` builds for `/lumiere-app/`. If migration SQL, Edge Function inputs, or `supabase/config.toml` changed since the deployed backend baseline, the hosted job applies migrations and deploys functions before Pages publishes.
- **Shared backend.** Preview and staging run frontend deployments, with SQL and functions tested against disposable Supabase in CI. The hosted site builds share the live project and its data. Features that need a pending migration can be exercised in CI or against a separately configured test project. Use backward-compatible backend changes so the current live frontend continues to work during a production promotion.

## Read the Actions results

PR jobs report the checked source, application checks, database checks, and Pages smoke test. Promotion runs report the published environment and link, built revision, source commit for sign-off, retained environments, and any preview expiry. **Summarize promotion** lists which jobs succeeded, failed, skipped, or reused an earlier run. A failed job's logs and any browser failure artifact have the step-level diagnostics.

## Recover or roll back

Promotions share a queue. GitHub Pages publishes one combined site, so the publisher loads the last successful `pages-state` snapshot, checks the retained build digests, and assembles all the paths. It pushes the proposed snapshot to `pages-prepared`, publishes Pages, then updates `pages-state`. The live `lumiere-deployment.json` marker lets the next run recover if publishing succeeded before the state update. For a superseded merge, use the newer promotion. For a failed preview whose source changed, start a fresh manual run.

To roll back one frontend environment, choose **Rollback preview**, **Rollback staging**, or **Rollback production**, select **SHA**, and enter the full commit from `pages-state` history containing the intended build. The publisher restores only that path. A preview restored from history needs fresh sign-off. Review compatibility with the currently deployed database and functions before a production rollback. SQL, Storage and Edge Function recovery are tracked in [#81](https://github.com/HimanshuHD/lumiere-app/issues/81).

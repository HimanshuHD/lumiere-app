# Preview, staging and release deployment

All three URLs use the pilot's browser-safe Supabase configuration. The public root is the release, `/lumiere-app/staging/` is the merged staging build, and `/lumiere-app/preview/` is the most recently previewed candidate. Relative paths below are under the project site.

## Roll out the workflows

1. Merge the workflow PR into staging after review. Promote the workflow changes through a release branch to main to install the trusted manual dispatcher and workflow-run listener. A workflow that only exists on staging cannot receive default-branch dispatches. During this bootstrap, use the existing #82 preview workflow for review; if the first release signal did not fire, check Actions before changing either deployed path. Do not dispatch the legacy publisher after cutover.
2. The initial deployment imports the successful combined artifact from run 45232260842 and compares its root and preview HTML with the live site. If either differs or the artifact expires, update the seed run and recorded source SHAs to the actually published versions before retrying. Staging first appears after an eligible staging merge.
3. Keep GitHub Pages publishing from Actions, allow the github-pages environment to deploy from main, and allow the publisher to write its two state branches. In Supabase Auth allow the exact preview and staging URLs ending in `/auth/callback/` alongside the production callback. Retain pilot admission and the existing database configuration.
4. After the new workflows are available, enable repository rules requiring PRs and up-to-date branches for staging and main. Require the application, database and Pages checks on both, the source check on main, and the **Preview verified** status on staging. Select the actual checks offered by GitHub after the first run. Protect state branches against unrelated writes while allowing the publisher. Bootstrap rules after the promotion workflow is installed to avoid blocking its own installation.

## Review a change

- Open a draft against staging. On marking it ready, validation runs. Open **Promote Lumiere Pages** on main, choose **Deploy**, then **PR**, **Branch**, or **SHA**, and enter the value. For the loader use PR number 83 once ready. A fresh read-only validation builds and tests the pinned source. Only the trusted publisher assembles and deploys the resulting static files.
- Open preview, verify the feature and copy the displayed workflow revision. Run **Verify preview**, choose **SHA**, and enter that full commit. Sign-off succeeds only for the active preview revision and posts the commit status. New commits need fresh verification. The single developer invoking verification supplies the manual acceptance.
- Merge the reviewed PR to staging. The merge notification starts a trusted promotion on main, validates the resulting staging revision and replaces only staging. Direct pushes are outside this flow.
- After staging acceptance, branch release/* from that verified staging revision and open a ready PR to main. A hotfix/* branch may start from main; preview/test it first and sync it into staging after release. Main deployment checks the merged source and branch tip. If the released backend differs from the previous production build, the hosted job runs before publishing the frontend. Until release, run pending migrations/functions on disposable Supabase and keep hosted UI compatible with the live API.

## Recover or retry

Each successful deployment records the source SHA, source-build content digest and run ID for each path in the pages-state branch. The publisher queues promotions, validates the retained bytes, and publishes a single combined artifact. The pages-prepared branch stores the proposed snapshot first. A successful deployment exposes its snapshot SHA in lumiere-deployment.json; the next promotion can complete an interrupted state-ref update. On a mismatch, inspect the last deployment and both refs before retrying. Retry a failed run from Actions. When a newer commit supersedes an older merge, use the newer run.

For a frontend rollback, select **Rollback preview**, **Rollback staging** or **Rollback production**, select **SHA**, and supply the full commit from pages-state history that contained the desired build. Review backend compatibility before a production rollback. The publisher restores the selected directory only. SQL, file bytes, and deployed functions have their own recovery procedure in #81.

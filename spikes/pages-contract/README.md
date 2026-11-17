# GitHub Pages contract proof (issue #45)

This is a **synthetic** standalone Vite site. It does not import or initialize Lumiere, Supabase, a Google provider, real tokens or personal records. Its route data is a fixed made-up UUID. Do not point the pilot to live Supabase during milestone 1.1.

## Local checks

```sh
npm ci --include=dev
node --test tests/pages-contract.test.ts
npx vite build --config spikes/pages-contract/vite.config.ts
npx vite preview --config spikes/pages-contract/vite.config.ts
```

The fixture base is `/lumiere-app/`. In a browser open the local preview at `http://localhost:4173/lumiere-app/` (use actual printed port). Verify that CSS and JS load with the correct base, and use DevTools Network to check missing assets do not return entry HTML.

## Actual GitHub Pages proof (must be performed after owner reviews the PR)

1. Owner merges the isolated branch into `main` and in repository Settings → Pages selects **GitHub Actions** as the publishing source. Do not enable a live Supabase integration.
2. Run the manually-dispatched **Synthetic Pages routing proof** workflow against `main`. It builds only `spikes/pages-contract/site` and publishes only that build. This will replace any existing Pages site: do not run if another site is already in use.
3. Visit `https://himanshuhd.github.io/lumiere-app/`; inspect JS/CSS asset requests and absence of production API calls.
4. Navigate to `#/read/12345678-1234-1234-1234-123456789abc`; refresh and open in a new tab; navigate to bookmarks and use Back/Forward.
5. Visit `https://himanshuhd.github.io/lumiere-app/auth/callback/` directly (and refresh): it must serve a real callback HTML document. Try **Simulate successful return** from reader; verify it restores the reader hash route in the same tab. Try **Simulate provider denial**, opening callback in a different tab, missing/expired return state and callback replay.
6. In DevTools Network or `curl -I`, request legacy clean paths `/lumiere-app/read/12345678-1234-1234-1234-123456789abc`, `/lumiere-app/profile` and `/lumiere-app/auth/callback` (no trailing slash). **Record actual HTTP response**, location redirects and displayed content. Do not claim the old URLs work just because hash links work.
7. Request an absent asset `/lumiere-app/assets/does-not-exist.js`; verify it isn't rewritten to the root app HTML.

## Important gaps

- Hash-based route links **are a candidate**, not yet a production routing migration. The actual app currently uses clean `pathname` routes. Do not mix them silently.
- Existing shared clean URLs may 404 when directly requested on Pages. A generic GitHub Pages `404.html` approach does not provide a real HTTP 200 response and is not an OAuth callback substitute.
- This fixture simulates returning from OAuth; it does not prove real Google/Supabase session exchange. Actual provider redirects and server-side admission require milestone 1.2.
- A public frontend is downloadable by anyone. Security depends on hosted Supabase admission, row-level security, storage and function authorization reviews.
- The deploy workflow is manual, and only `main` can deploy; PR runs build/test without publishing. The owner remains responsible for reviewing/merging and deciding when to replace a Pages site.

## Acceptance evidence

Record exact date, commit SHA, actual URL, HTTP statuses, browser version, screenshots/network console results and any failing cases back in #45 before closure. If retaining clean URLs is required, prefer an SPA-rewrite-capable host instead of presenting hash migration as backward-compatible.

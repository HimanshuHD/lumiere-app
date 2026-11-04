# lumiere-app

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-ladzbcqm)

## Local setup

This project uses Supabase Auth, Storage, and the database. The Supabase CLI runs a complete local Supabase stack (including PostgreSQL) with Docker.

1. Install Node.js (which includes npm) and Docker Desktop, then start Docker Desktop.
2. From the project root, install the project dependencies:

   ```powershell
   npm ci --include=dev
   ```

3. Start the local Supabase services. On the first run, Docker downloads the required images, then Supabase creates the local services and applies the migrations:

   ```powershell
   npm run supabase:start
   ```

4. Get the local API URL and anon key:

   ```powershell
   npm run supabase:status
   ```

   Copy `.env.example` to `.env.local`, then set `VITE_SUPABASE_URL` to the local **API URL** and `VITE_SUPABASE_ANON_KEY` to the **anon key** shown by the status command. The default API URL is `http://127.0.0.1:54321`.

   ```powershell
   Copy-Item .env.example .env.local
   ```

5. Start the app:

   ```powershell
   npm run dev
   ```

   Open the local URL printed by Vite (usually `http://localhost:5173`).

### Local users and data

The migrations create the database schema, row-level security policies, and storage buckets; they do not create a login account or sample documents. Create an account from the app's **Create Account** screen, then sign in with that email and password. Local email confirmation is disabled. You can view accounts in Supabase Studio under **Authentication → Users**.

New local databases have no documents, bookmarks, or reading progress until you add them through the app. The `supabase/snippets/` directory is for manual SQL queries and is not automatically run as seed data.

### Optional demo stories (no database reset)

Generated demo content is opt-in. After starting local Supabase, apply migrations and seed:

```sh
npx supabase migration up --local
npm run supabase:seed:demo
```

This adds the eight shared text demo stories for all signed-in users. Running it again does not
create duplicates or replace existing stories, bookmarks, or reading progress. It imports no
accounts, personal activity, legacy PDF, or original-project storage references. Production demo
loading remains an explicit deployment decision.

For missing/misclassified records, run `supabase/snippets/demo_data_status.sql` in local Studio.
See [demo content and recovery](docs/development/demo-content.md) for classification, authorization,
validation, and manual browser checks. Do not import the complete historical dump or reset the
database to restore these stories.

### Local Google sign-in

Google sign-in requires OAuth credentials from a Google Cloud OAuth client; Supabase migrations do not create these credentials. Create a **Web application** OAuth client in Google Cloud Console and add this authorized redirect URI:

```text
http://127.0.0.1:54321/auth/v1/callback
```

Create `supabase/.env` with the client ID and client secret:

```dotenv
SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID=your-google-client-id
SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET=your-google-client-secret
```

The local Supabase config reads these server-side credentials to enable the Google provider. `supabase/.env` is ignored by Git; do not put either credential in `.env.local`, a `VITE_` variable, or committed files. Restart the local stack after changing provider credentials with `npm run supabase:stop` followed by `npm run supabase:start`. Open the app using a Vite URL on `localhost` or `127.0.0.1` at port `5173` or `5174` so its OAuth return URL is allowed.

### URL navigation and hosting

Existing views and documents have stable URLs, including `/bookmarks`, `/profile` and
`/read/<document UUID>`. Refresh and browser Back/Forward retain route identity. Deployment must serve
the app HTML for direct app-route requests. Google sign-in now returns through `/auth/callback`;
allow that exact app URL in Supabase, separately from Google's Supabase provider callback.
See [navigation setup and manual tests](docs/development/url-navigation.md) for subdirectory builds,
OAuth allowlists, hosting fallback rules and account-transition behavior. No database migration is needed.

### Local Supabase services

Supabase Studio is available at `http://127.0.0.1:54323`; the local PostgreSQL server listens on port `54322`. Use `npm run supabase:status` to view service status and local connection details, and `npm run supabase:stop` to stop the stack.

`npm run supabase:reset` destroys and rebuilds the local database, reapplies migrations, and removes local database data, including user accounts and app records. Do not use it if you need to keep local data.

`.env.local` is excluded from Git. Only use the local anon key in this client-side app; never put a Supabase `service_role` or secret key in client-side code or environment variables prefixed with `VITE_`.

### Document access security

Document ownership, visibility, private storage, deployment order, URL expiry, and recovery guidance are documented in [supabase/SECURITY_DEPLOYMENT.md](./supabase/SECURITY_DEPLOYMENT.md).

The later Node.js backend can be a separate project and connect to this local PostgreSQL instance. Before building it, decide whether it should replace Supabase Auth/Storage too or only provide a custom API over the same database.


### Browser test setup and installation troubleshooting

Existing-flow keyboard/dialog/PDF accessibility work and its manual screen-reader checklist are
documented in [accessibility validation](docs/development/accessibility.md). The browser command
includes axe scans plus explicit focus and PDF text/link lifecycle checks using synthetic fixtures.

Use Node.js 24 (matching CI) and run commands from the repository root. Browser tests
start their own Vite server and mock Supabase; no local Supabase stack is required.

```powershell
npm ci --include=dev
npm run setup:browser
npm run test:browser
```

The Playwright Node package is a development dependency; Chromium is a separate download.
Re-run `setup:browser` after Playwright upgrades. CI uses `playwright install --with-deps chromium`
to install Linux system dependencies too. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` optionally selects
an existing compatible Chromium executable.

If installation fails, browser tests cannot repair that failure automatically. Check the
first npm error (not just the final summary):

- `EUSAGE` / manifest-lockfile mismatch: confirm both `package.json` and `package-lock.json`
  are from the same checkout. Do not delete or regenerate the lockfile as a routine fix.
- `EPERM` / `EBUSY` on Windows: stop Vite/test processes and close programs locking files,
  then retry. `npm ci` replaces `node_modules`.
- `ENOTFOUND`, `EAI_AGAIN`, proxy, or certificate errors: check registry connectivity and
  your configured proxy/CA trust. Keep TLS verification enabled.
- Missing `playwright`: use `--include=dev`, even when your environment omits development
  dependencies, then run `npm ls playwright` to confirm installation.

If it still fails, retain the exact command and first error block for diagnosis. An
installation failure is separate from Supabase Edge Function/Docker DNS failures.

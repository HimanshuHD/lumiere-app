# lumiere-app

[![Open in Bolt](https://bolt.new/static/open-in-bolt.svg)](https://bolt.new/~/sb1-ladzbcqm)

## Local setup

This project uses Supabase Auth, Storage, and the database. The Supabase CLI runs a complete local Supabase stack (including PostgreSQL) with Docker.

1. Install Node.js (which includes npm) and Docker Desktop, then start Docker Desktop.
2. From the project root, install the project dependencies:

   ```powershell
   npm install
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

### Local Supabase services

Supabase Studio is available at `http://127.0.0.1:54323`; the local PostgreSQL server listens on port `54322`. Use `npm run supabase:status` to view service status and local connection details, and `npm run supabase:stop` to stop the stack.

`npm run supabase:reset` destroys and rebuilds the local database, reapplies migrations, and removes local database data, including user accounts and app records. Do not use it if you need to keep local data.

`.env.local` is excluded from Git. Only use the local anon key in this client-side app; never put a Supabase `service_role` or secret key in client-side code or environment variables prefixed with `VITE_`.

The later Node.js backend can be a separate project and connect to this local PostgreSQL instance. Before building it, decide whether it should replace Supabase Auth/Storage too or only provide a custom API over the same database.

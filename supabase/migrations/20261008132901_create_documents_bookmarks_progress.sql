/*
# Create tables for the document reader application

## Summary
This migration creates the core schema for an online document reader app with user accounts.
It sets up three tables: documents (publicly readable library content),
bookmarks (user-saved documents), and reading_progress (per-user progress tracking).

## New Tables

### 1. documents
Stores document metadata and chapter content for the reading library.
- id (uuid, primary key)
- title (text, not null) — document title
- author (text, not null) — author name
- category (text, not null) — category tag (Fiction, Non-Fiction, Technology, History, Science, Philosophy, Adventure)
- cover_url (text) — URL to cover image
- reading_time (int) — estimated reading time in minutes
- summary (text) — short description shown on cards and hero
- chapters (jsonb, not null) — array of { title, content } objects
- is_featured (boolean, default false) — whether to show in the hero section
- created_at (timestamptz)

### 2. bookmarks
Stores user-saved documents for their personal collection.
- id (uuid, primary key)
- user_id (uuid, not null, defaults to auth.uid()) — owner
- document_id (uuid, not null, references documents) — saved document
- created_at (timestamptz)

### 3. reading_progress
Tracks how far each reader has progressed in each document.
- id (uuid, primary key)
- user_id (uuid, not null, defaults to auth.uid()) — owner
- document_id (uuid, not null, references documents) — document being read
- chapter_index (int, default 0) — current chapter index
- scroll_percent (numeric, default 0) — percentage scrolled within the chapter
- updated_at (timestamptz)

## Security
- RLS enabled on all tables.
- documents: readable by all authenticated users (shared library content).
  INSERT/UPDATE/DELETE restricted to authenticated users (for seeding/admin purposes).
- bookmarks: owner-scoped CRUD — each user only sees and manages their own bookmarks.
- reading_progress: owner-scoped CRUD — each user only sees and manages their own progress.
- Owner columns (user_id) default to auth.uid() so client inserts without explicit user_id succeed.

## Notes
1. documents is intentionally shared (all readers see the same library).
2. bookmarks and reading_progress are private per user.
3. Unique constraints prevent duplicate bookmarks and duplicate progress entries per user/document.
*/

CREATE TABLE IF NOT EXISTS documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  author text NOT NULL,
  category text NOT NULL,
  cover_url text,
  reading_time int NOT NULL DEFAULT 10,
  summary text NOT NULL DEFAULT '',
  chapters jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_featured boolean NOT NULL DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE(user_id, document_id)
);

CREATE TABLE IF NOT EXISTS reading_progress (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  chapter_index int NOT NULL DEFAULT 0,
  scroll_percent numeric NOT NULL DEFAULT 0,
  updated_at timestamptz DEFAULT now(),
  UNIQUE(user_id, document_id)
);

ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE reading_progress ENABLE ROW LEVEL SECURITY;

-- documents: all authenticated users can read
DROP POLICY IF EXISTS "select_documents" ON documents;
CREATE POLICY "select_documents" ON documents FOR SELECT
TO authenticated USING (true);

DROP POLICY IF EXISTS "insert_documents" ON documents;
CREATE POLICY "insert_documents" ON documents FOR INSERT
TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "update_documents" ON documents;
CREATE POLICY "update_documents" ON documents FOR UPDATE
TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "delete_documents" ON documents;
CREATE POLICY "delete_documents" ON documents FOR DELETE
TO authenticated USING (true);

-- bookmarks: owner-scoped CRUD
DROP POLICY IF EXISTS "select_own_bookmarks" ON bookmarks;
CREATE POLICY "select_own_bookmarks" ON bookmarks FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_bookmarks" ON bookmarks;
CREATE POLICY "insert_own_bookmarks" ON bookmarks FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_bookmarks" ON bookmarks;
CREATE POLICY "update_own_bookmarks" ON bookmarks FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_bookmarks" ON bookmarks;
CREATE POLICY "delete_own_bookmarks" ON bookmarks FOR DELETE
TO authenticated USING (auth.uid() = user_id);

-- reading_progress: owner-scoped CRUD
DROP POLICY IF EXISTS "select_own_progress" ON reading_progress;
CREATE POLICY "select_own_progress" ON reading_progress FOR SELECT
TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_progress" ON reading_progress;
CREATE POLICY "insert_own_progress" ON reading_progress FOR INSERT
TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_progress" ON reading_progress;
CREATE POLICY "update_own_progress" ON reading_progress FOR UPDATE
TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_progress" ON reading_progress;
CREATE POLICY "delete_own_progress" ON reading_progress FOR DELETE
TO authenticated USING (auth.uid() = user_id);

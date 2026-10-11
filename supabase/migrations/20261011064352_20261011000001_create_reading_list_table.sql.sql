/*
# Create reading_list table (Read Later / wishlist for books)

1. New Tables
- `reading_list`
  - `id` (uuid, primary key)
  - `user_id` (uuid, not null, defaults to auth.uid() — the user who saved the book)
  - `document_id` (uuid, not null, references documents(id) on delete cascade)
  - `created_at` (timestamptz, defaults to now())
  - Unique constraint on (user_id, document_id) so a user can only save a book once.

2. Security
- Enable RLS on `reading_list`.
- Owner-scoped CRUD: each authenticated user can only access their own reading list entries.
- 4 separate policies: SELECT, INSERT, UPDATE, DELETE — all scoped via auth.uid() = user_id.

3. Important Notes
- This table powers the "Read Later" feature. When a user starts reading a book
  (i.e. a reading_progress row is created), the app removes the corresponding
  reading_list entry from the frontend.
- The `user_id` column has `DEFAULT auth.uid()` so frontend inserts that omit
  user_id still satisfy the INSERT policy's WITH CHECK.
*/

CREATE TABLE IF NOT EXISTS reading_list (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  document_id uuid NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
  created_at timestamptz DEFAULT now(),
  UNIQUE (user_id, document_id)
);

ALTER TABLE reading_list ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "select_own_reading_list" ON reading_list;
CREATE POLICY "select_own_reading_list" ON reading_list
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "insert_own_reading_list" ON reading_list;
CREATE POLICY "insert_own_reading_list" ON reading_list
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "update_own_reading_list" ON reading_list;
CREATE POLICY "update_own_reading_list" ON reading_list
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "delete_own_reading_list" ON reading_list;
CREATE POLICY "delete_own_reading_list" ON reading_list
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS idx_reading_list_user_id ON reading_list(user_id);
CREATE INDEX IF NOT EXISTS idx_reading_list_document_id ON reading_list(document_id);

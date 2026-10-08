/*
# Add upload tracking fields to documents table

## Summary
Adds columns to support user-uploaded documents: who uploaded, when, page count, file URL, and file format. Also adds an index on created_at for efficient "Recent Additions" sorting.

## Changes to existing tables

### documents (modified)
- uploaded_by (uuid, nullable) — references auth.users(id). NULL for seeded/admin content. Set to auth.uid() on user upload.
- page_count (int, nullable) — number of pages determined from the uploaded document's metadata.
- file_url (text, nullable) — URL to the uploaded document file in Supabase Storage.
- file_format (text, nullable) — the document format (e.g. 'pdf', 'epub', 'txt').
- file_name (text, nullable) — original filename of the uploaded document.

## Security
- RLS already enabled on documents. Existing policies allow all authenticated users to SELECT, INSERT, UPDATE, DELETE.
- The uploaded_by column defaults to auth.uid() so user uploads are automatically attributed.
- No new policies needed; existing policies cover the new columns.

## Notes
1. All new columns are nullable so existing seeded documents are unaffected.
2. uploaded_by uses DEFAULT auth.uid() so insert calls omitting it get the current user automatically.
*/

ALTER TABLE documents ADD COLUMN IF NOT EXISTS uploaded_by uuid REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT auth.uid();
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count int;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_url text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_format text;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS file_name text;

CREATE INDEX IF NOT EXISTS documents_created_at_idx ON documents (created_at DESC);

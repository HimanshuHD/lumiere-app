/*
# Create storage bucket for document uploads

## Summary
Creates a public storage bucket 'documents' for storing uploaded document files and cover images. Sets up RLS policies so authenticated users can upload and read files.

## Storage
- Bucket name: documents
- Public: true (read access for all, upload for authenticated)

## Security
- Public read access for all users (anon + authenticated)
- Upload/update/delete restricted to authenticated users
*/

INSERT INTO storage.buckets (id, name, public) VALUES ('documents', 'documents', true) ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS "documents_bucket_read" ON storage.objects;
CREATE POLICY "documents_bucket_read" ON storage.objects FOR SELECT
TO anon, authenticated USING (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_bucket_insert" ON storage.objects;
CREATE POLICY "documents_bucket_insert" ON storage.objects FOR INSERT
TO authenticated WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_bucket_update" ON storage.objects;
CREATE POLICY "documents_bucket_update" ON storage.objects FOR UPDATE
TO authenticated USING (bucket_id = 'documents') WITH CHECK (bucket_id = 'documents');

DROP POLICY IF EXISTS "documents_bucket_delete" ON storage.objects;
CREATE POLICY "documents_bucket_delete" ON storage.objects FOR DELETE
TO authenticated USING (bucket_id = 'documents');

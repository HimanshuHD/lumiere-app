import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
const migrationName = '20261103000000_document_summary_metadata.sql';
const migrations = new URL('../supabase/migrations/', import.meta.url);
const owner = '81000000-0000-4000-8000-000000000001';
const other = '81000000-0000-4000-8000-000000000002';
async function database() {
  const db = new PGlite();
  // Supabase supplies these schemas, roles, storage helpers and default grants.
  // All public app tables, constraints, policies and RPCs come from actual migrations.
  await db.exec(`
    CREATE ROLE authenticated; CREATE ROLE anon; CREATE ROLE service_role BYPASSRLS;
    CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id uuid PRIMARY KEY, raw_app_meta_data jsonb DEFAULT '{}');
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS
      $$SELECT nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb DEFAULT '{}');
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE FUNCTION storage.foldername(text) RETURNS text[] LANGUAGE sql IMMUTABLE AS $$SELECT string_to_array($1,'/')$$;
    CREATE FUNCTION storage.filename(text) RETURNS text LANGUAGE sql IMMUTABLE AS $$SELECT regexp_replace($1,'^.*/','')$$;
    GRANT USAGE ON SCHEMA public,auth,storage TO authenticated,anon,service_role;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO authenticated,anon;
    INSERT INTO auth.users(id) VALUES ('${owner}'),('${other}');
  `);
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql') && name <= migrationName).sort()) {
    await db.exec('BEGIN;\n' + readFileSync(new URL(name, migrations), 'utf8') + '\nCOMMIT;');
  }
  return db;
}

test('summary metadata tracks content changes and locked summaries never expose content', async () => {
 const db=await database();
 try {
  const id='82000000-0000-4000-8000-000000000001';
  await db.query(`INSERT INTO documents(id,title,author,category,origin,visibility,uploaded_by,chapters) VALUES($1,'Private','QA','Tests','user_upload','shared',$2,$3)`,[id,owner,JSON.stringify([{title:'One',content:'secret words'},{title:'Two',content:'more secrets'}])]);
  assert.equal((await db.query('SELECT chapter_count FROM documents WHERE id=$1',[id])).rows[0].chapter_count,2);
  await db.exec(`SELECT set_config('request.jwt.claim.sub','${other}',false); SET ROLE authenticated;`);
  await db.query('INSERT INTO bookmarks(document_id) VALUES($1)',[id]);
  await db.exec('RESET ROLE');
  await db.query("UPDATE documents SET visibility='private' WHERE id=$1",[id]);
  await db.exec('SET ROLE authenticated');
  assert.equal((await db.query('SELECT * FROM documents WHERE id=$1',[id])).rows.length,0);
  const locked=(await db.query<{value:Record<string,unknown>}>('SELECT get_locked_document_summaries() AS value')).rows;
  assert.equal(locked.length,1);assert.equal(locked[0].value.id,id);assert.equal(locked[0].value.chapter_count,0);
  assert.equal('chapters' in locked[0].value,false);assert.equal(JSON.stringify(locked).includes('secret words'),false);
  await db.exec('RESET ROLE');
  await db.query("UPDATE documents SET chapters='[]' WHERE id=$1",[id]);
  assert.equal((await db.query('SELECT chapter_count FROM documents WHERE id=$1',[id])).rows[0].chapter_count,0);
  await db.exec('SET ROLE anon');
  await assert.rejects(db.query('SELECT get_locked_document_summaries()'),/permission denied/);
 } finally {await db.close();}
});

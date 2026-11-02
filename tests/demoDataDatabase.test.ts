import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync, readdirSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';

const migrationName = '20261102001100_classify_generated_demo_stories.sql';
const migrations = new URL('../supabase/migrations/', import.meta.url);
const migration = readFileSync(new URL(migrationName, migrations), 'utf8');
const seed = readFileSync(new URL('../supabase/seeds/demo.sql', import.meta.url), 'utf8');
const stories = JSON.parse(seed.match(/\$demo_stories\$([\s\S]*?)\$demo_stories\$/)![1]);
const owner = '71000000-0000-4000-8000-000000000001';
const other = '71000000-0000-4000-8000-000000000002';
const privateId = '72000000-0000-4000-8000-000000000001';
const catalogId = '72000000-0000-4000-8000-000000000002';
const legacyPdfId = '06e6e69a-302a-4763-8cd6-47eae64b0dd9';

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
  for (const name of readdirSync(migrations).filter(name => name.endsWith('.sql') && name < migrationName).sort()) {
    await db.exec('BEGIN;\n' + readFileSync(new URL(name, migrations), 'utf8') + '\nCOMMIT;');
  }
  return db;
}
async function count(db: PGlite, sql: string) { return (await db.query<{count: number}>(sql)).rows[0].count; }
async function asUser(db: PGlite, id: string) {
  await db.exec(`RESET ROLE; SELECT set_config('request.jwt.claim.sub','${id}',false); SET ROLE authenticated;`);
}

test('migration preserves existing story content, IDs and personal references, excluding genuine files', async () => {
  const db = await database();
  try {
    await db.query(`INSERT INTO documents(id,title,author,category,chapters,origin,visibility,uploaded_by)
      VALUES($1,'Preserved title','QA','Fiction',$2,'catalog_import','shared',NULL)`, [stories[0].id, JSON.stringify(stories[0].chapters)]);
    await db.query(`INSERT INTO documents(id,title,author,category,chapters,origin,visibility,uploaded_by,file_format)
      VALUES($1,'Legacy PDF','QA','Technology','[]','catalog_import','shared',NULL,'pdf'),
      ($2,'Private upload','QA','Fiction','[]','user_upload','private',$3,'txt')`, [legacyPdfId, privateId, owner]);
    await db.query(`INSERT INTO documents(id,title,author,category,origin,visibility,uploaded_by,source_identity)
      VALUES($1,'Real catalog','QA','Fiction','catalog_import','shared',NULL,'test-catalog:edition')`, [catalogId]);
    await db.query('INSERT INTO bookmarks(user_id,document_id) VALUES($1,$2)', [owner, stories[0].id]);
    await db.query('INSERT INTO reading_progress(user_id,document_id,chapter_index,scroll_percent) VALUES($1,$2,2,.6)', [owner, stories[0].id]);
    await db.query('INSERT INTO reading_list(user_id,document_id) VALUES($1,$2)', [owner, stories[0].id]);
    await db.exec('BEGIN;'+migration+'COMMIT;');
    const story = (await db.query('SELECT * FROM documents WHERE id=$1', [stories[0].id])).rows[0];
    assert.equal(story.origin,'demo'); assert.equal(story.title,'Preserved title');
    assert.deepEqual(story.chapters,stories[0].chapters); assert.equal(story.file_format,'txt');
    assert.equal(await count(db,'SELECT count(*)::int FROM bookmarks'),1);
    assert.equal(await count(db,'SELECT count(*)::int FROM reading_list'),1);
    assert.equal((await db.query('SELECT chapter_index,scroll_percent FROM reading_progress')).rows[0].chapter_index,2);
    assert.equal(await count(db,`SELECT count(*)::int FROM documents WHERE id='${legacyPdfId}' AND origin='catalog_import' AND file_format='pdf'`),1);
    assert.equal(await count(db,`SELECT count(*)::int FROM documents WHERE id='${catalogId}' AND origin='catalog_import'`),1);
    assert.equal(await count(db,`SELECT count(*)::int FROM documents WHERE id='${privateId}' AND origin='user_upload' AND visibility='private'`),1);
    await db.exec(seed); await db.exec(seed);
    assert.equal(await count(db,"SELECT count(*)::int FROM documents WHERE origin='demo'"),8);
    assert.equal((await db.query('SELECT title FROM documents WHERE id=$1',[stories[0].id])).rows[0].title,'Preserved title');
    assert.equal(await count(db,'SELECT count(*)::int FROM bookmarks'),1);
    // Unexpected data must not be overwritten, and an unsuccessful seed is atomic.
    await db.query("UPDATE documents SET origin='user_upload',visibility='private',uploaded_by=$1 WHERE id=$2",[owner,stories[1].id]);
    await db.query('DELETE FROM documents WHERE id=$1',[stories[2].id]);
    const before = await count(db,'SELECT count(*)::int FROM documents');
    await assert.rejects(db.exec(seed),/Demo IDs conflict/);
    await db.exec('ROLLBACK;');
    assert.equal(await count(db,'SELECT count(*)::int FROM documents'),before);
    assert.equal((await db.query('SELECT origin FROM documents WHERE id=$1',[stories[1].id])).rows[0].origin,'user_upload');
  } finally { await db.close(); }
});

test('fresh seed is opt-in, repeatable, shared to new users and restricted by real app RLS', async () => {
  const db = await database();
  try {
    await db.exec('BEGIN;'+migration+'COMMIT;');
    assert.equal(await count(db,'SELECT count(*)::int FROM documents'),0);
    await db.exec(seed); await db.exec(seed);
    assert.equal(await count(db,'SELECT count(*)::int FROM documents'),8);
    assert.equal(await count(db,'SELECT count(*)::int FROM profiles'),0);
    for (const table of ['bookmarks','reading_progress','reading_list','document_library_memberships']) {
      assert.equal(await count(db,`SELECT count(*)::int FROM ${table}`),0);
    }
    await db.query(`INSERT INTO documents(id,title,author,category,origin,visibility,uploaded_by,file_format)
      VALUES($1,'Private','QA','Tests','user_upload','private',$2,'txt')`,[privateId,owner]);
    const newUser = '71000000-0000-4000-8000-000000000003';
    await db.query('INSERT INTO auth.users(id) VALUES($1)',[newUser]);
    for (const id of [owner,other,newUser]) {
      await asUser(db,id);
      assert.equal(await count(db,"SELECT count(*)::int FROM documents WHERE origin='demo'"),8);
      assert.equal(await count(db,'SELECT count(*)::int FROM document_library_memberships'),0);
      assert.equal((await db.query('UPDATE documents SET title=$1 WHERE id=$2 RETURNING id',['Forged',stories[0].id])).rows.length,0);
      assert.equal((await db.query('DELETE FROM documents WHERE id=$1 RETURNING id',[stories[0].id])).rows.length,0);
      await assert.rejects(db.query(`INSERT INTO documents(title,author,category,origin,visibility,uploaded_by,file_format,chapters)
        VALUES('Forged','QA','Tests','demo','shared',NULL,'txt','[{"title":"x","content":"x"}]')`),/row-level security/);
      await assert.rejects(db.query('INSERT INTO document_library_memberships(document_id) VALUES($1)',[stories[0].id]),/row-level security/);
      await db.query('INSERT INTO bookmarks(document_id) VALUES($1)',[stories[0].id]);
      await db.query('INSERT INTO reading_list(document_id) VALUES($1)',[stories[0].id]);
      const saved = await db.query<{result:{accepted:boolean}}>(`SELECT save_reading_position($1,$2,$3,1,.5,0,$4) AS result`,[id,stories[0].id,JSON.stringify({version:1,format:'txt',chapterIndex:1,chapterProgress:.5}),crypto.randomUUID()]);
      assert.equal(saved.rows[0].result.accepted,true);
    }
    assert.equal(await count(db,`SELECT count(*)::int FROM documents WHERE id='${privateId}'`),0);
    await db.exec('RESET ROLE; SET ROLE anon;');
    assert.equal(await count(db,"SELECT count(*)::int FROM documents WHERE origin='demo'"),0);
    await db.exec('RESET ROLE;');
    // A privileged actor can manage demo content, but malformed demo records fail constraints.
    assert.equal((await db.query('UPDATE documents SET summary=$1 WHERE id=$2 RETURNING id',['Reviewed',stories[0].id])).rows.length,1);
    await assert.rejects(db.query('UPDATE documents SET file_format=NULL WHERE id=$1',[stories[0].id]),/documents_demo_content_check/);
    await assert.rejects(db.query("UPDATE documents SET visibility='private' WHERE id=$1",[stories[0].id]),/documents_demo_content_check/);
    await assert.rejects(db.query('UPDATE documents SET uploaded_by=$1 WHERE id=$2',[owner,stories[0].id]),/check constraint/);
  } finally { await db.close(); }
});

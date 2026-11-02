import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readFileSync } from 'node:fs';
import type { Document } from '../src/lib/supabase.ts';
import { selectLibraryDocuments } from '../src/lib/libraryDocuments.ts';
import { addCatalogDocumentToCollection, removeCatalogDocumentFromCollection } from '../src/services/catalogCollection.ts';
import { updateUserDocument } from '../src/services/userDocumentVisibility.ts';

const demo = { id: 'demo', origin: 'demo', visibility: 'shared' } as Document;
test('shared demo stories appear for existing and new users without catalog membership', () => {
  const catalog = { ...demo, id: 'catalog', origin: 'catalog_import' } as Document;
  const upload = { ...demo, id: 'upload', origin: 'user_upload' } as Document;
  const privateDemo = { ...demo, id: 'invalid-demo', visibility: 'private' } as Document;
  assert.deepEqual(selectLibraryDocuments([demo, catalog, upload, privateDemo], new Set()).map(d => d.id), ['demo', 'upload']);
  assert.deepEqual(selectLibraryDocuments([demo, catalog], new Set(['catalog'])).map(d => d.id), ['demo', 'catalog']);
});
test('demo stories cannot use personal catalog add/remove or upload visibility operations', async () => {
  const store = { async addMembership() { throw Error('must not call'); }, async removeMembership() { throw Error('must not call'); } };
  await assert.rejects(addCatalogDocumentToCollection(store, 'user', demo), /Only shared catalog/);
  await assert.rejects(removeCatalogDocumentFromCollection(store, 'user', demo), /Only shared catalog/);
  await assert.rejects(updateUserDocument({ async updateOwnedDocument() { throw Error('must not call'); } }, 'user', demo, { title: 'Forged', author: 'QA', category: 'Tests', summary: '', visibility: 'private' }), /Only the owner/);
});
test('seed includes exactly eight stable generated stories and no historical PDF or personal records', () => {
  const sql = readFileSync(new URL('../supabase/seeds/demo.sql', import.meta.url), 'utf8');
  const data = JSON.parse(sql.match(/\$demo_stories\$([\s\S]*?)\$demo_stories\$/)![1]);
  const ids = [
    '4350bfc7-cd8c-4725-9d1b-9051c7a32866', '5f85fae3-360a-45d9-a9cb-513c302e079e',
    '77123519-4519-4883-9e24-b728caec341a', '54c48967-1e6d-4d4c-8e9c-3d231b20f29b',
    'e488bba3-8393-4b5b-8070-be2ac30da5ae', 'c2c801f8-e2c7-4390-a592-db1900526a70',
    'b3bcd430-e854-45bf-86df-eb7251fb2d82', '666d33ce-a9a8-4d2c-9d63-483188180020',
  ];
  assert.deepEqual(data.map((d: {id: string}) => d.id), ids);
  const keys = ['id', 'title', 'author', 'category', 'reading_time', 'summary', 'chapters', 'is_featured', 'created_at'].sort();
  for (const story of data) {
    assert.deepEqual(Object.keys(story).sort(), keys);
    assert.equal(story.chapters.length, 4);
    for (const chapter of story.chapters) {
      assert.equal(typeof chapter.title, 'string'); assert.ok(chapter.content.length > 200);
    }
  }
  assert.doesNotMatch(sql, /INSERT INTO (?:auth\.|profiles|bookmarks|reading_progress|reading_list)|storage\/v1|06e6e69a-302a-4763-8cd6-47eae64b0dd9/i);
});

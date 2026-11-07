// Real local Auth/PostgREST/Storage/Edge Function acceptance. No hosted credentials or tracing.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { createClient } from '@supabase/supabase-js';
import { chromium } from 'playwright';
import { createServer } from 'vite';

assert.match(readFileSync('.test-stack/supabase/config.toml', 'utf8'), /project_id = "lumiere-quality-test"/);
const status = spawnSync(process.platform === 'win32' ? 'npx.cmd' : 'npx', ['supabase', 'status', '--workdir', '.test-stack', '-o', 'json'], { encoding: 'utf8', shell: process.platform === 'win32' });
assert.equal(status.status, 0, 'Start the disposable test stack first');
const config = JSON.parse(status.stdout);
const api = config.API_URL;
assert.equal(new URL(api).hostname, '127.0.0.1', 'Only the disposable loopback backend is allowed');
assert.equal(new URL(api).port, '55321', 'Never use the normal developer stack');
const key = config.ANON_KEY;
const admin = createClient(api, config.SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const client = () => createClient(api, key, { auth: { persistSession: false, autoRefreshToken: false } });
const owner = client(), other = client();
const users = [], paths = [], documents = [];
const password = `Quality-${randomUUID()}!`;
const suffix = randomUUID();
const emails = [`owner-${suffix}@example.test`, `reader-${suffix}@example.test`];
const check = result => { assert.equal(result.error, null, result.error?.message); return result.data; };
async function until(checkCondition) {
  const deadline = Date.now() + 30_000;
  while (!(await checkCondition())) {
    assert.ok(Date.now() < deadline, 'Timed out waiting for local persistence');
    await new Promise(resolve => setTimeout(resolve, 100));
  }
}
process.env.VITE_SUPABASE_URL = api;
process.env.VITE_SUPABASE_ANON_KEY = key;
const server = await createServer({ server: { host: '127.0.0.1', port: 0 } });
let browser;
try {
  for (const email of emails) users.push(check(await admin.auth.admin.createUser({ email, password, email_confirm: true })).user.id);
  check(await owner.auth.signInWithPassword({ email: emails[0], password }));
  check(await other.auth.signInWithPassword({ email: emails[1], password }));
  await server.listen();
  browser = await chromium.launch({ ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {}), args: ['--no-sandbox', '--disable-dev-shm-usage'] });
  const page = await browser.newPage();
  page.setDefaultTimeout(30_000);
  const origin = `http://127.0.0.1:${server.httpServer.address().port}`;
  await page.goto(origin);
  await page.locator('#root[inert]').waitFor({ state: 'detached' });
  await page.locator('#auth-email').fill(emails[0]);
  await page.locator('#auth-password').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.getByRole('button', { name: 'Import Books', exact: true }).waitFor();
  await page.goto(origin + '/upload');
  await page.locator('#root[inert]').waitFor({ state: 'detached' });
  // Use wrong but bucket-allowlisted MIME types so the finalizer, not bucket admission, is tested.
  await page.locator('#upload-document').setInputFiles({ name: 'quality.txt', mimeType: 'application/pdf', buffer: Buffer.from('First synthetic section.\n\n\nSecond synthetic section.') });
  await page.locator('#upload-title').fill('Local quality fixture');
  await page.locator('#upload-author').fill('Synthetic author');
  const cover = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6PjAAAAAASUVORK5CYII=', 'base64');
  await page.locator('#upload-cover').setInputFiles({ name: 'cover.png', mimeType: 'image/jpeg', buffer: cover });
  const finalization = Promise.race([
    page.waitForResponse(response => response.url().endsWith('/functions/v1/finalize-user-document-upload') && response.request().method() === 'POST'),
    page.locator('#upload-error').waitFor({ state: 'visible' }).then(async () => { throw new Error(await page.locator('#upload-error').textContent()); }),
  ]);
  await page.getByRole('button', { name: 'Upload Document', exact: true }).click();
  const finalized = await finalization;
  assert.equal(finalized.status(), 201, `Finalizer ${finalized.status()}: ${await finalized.text()}`);
  let document;
  await until(async () => {
    const error = page.locator('#upload-error');
    if (await error.count()) assert.fail(await error.textContent());
    document = check(await owner.from('documents').select('*').eq('uploaded_by', users[0]).eq('title', 'Local quality fixture')).at(0);
    return document;
  });
  documents.push(document.id); paths.push(document.file_storage_path);
  paths.push(document.cover_storage_path);
  const objects = check(await admin.storage.from('documents').list(users[0], { search: document.id }));
  assert.equal(objects.find(object => object.name === `${document.id}.txt`).metadata.mimetype, 'text/plain');
  assert.equal(objects.find(object => object.name === `${document.id}-cover.png`).metadata.mimetype, 'image/png');
  assert.deepEqual(Buffer.from(await check(await owner.storage.from('documents').download(document.cover_storage_path)).arrayBuffer()), cover);
  assert.equal(document.chapters.length, 2);
  assert.equal(document.visibility, 'private');
  assert.deepEqual(check(await other.from('documents').select('id').eq('id', document.id)), []);
  assert.ok((await other.storage.from('documents').createSignedUrl(document.file_storage_path, 60)).error, 'Private storage cannot be signed by another user');
  await page.goto(origin + '/read/' + document.id);
  await page.getByRole('button', { name: 'Bookmark document', exact: true }).click();
  await page.getByRole('button', { name: 'Remove bookmark', exact: true }).waitFor();
  assert.equal(check(await owner.from('bookmarks').select('id').eq('document_id', document.id)).length, 1);
  assert.deepEqual(check(await other.from('bookmarks').select('id').eq('document_id', document.id)), []);
  await page.getByRole('button', { name: 'Next', exact: true }).click();
  await until(async () => check(await owner.from('reading_progress').select('position').eq('document_id', document.id)).at(0)?.position?.chapterIndex === 1);
  await page.reload();
  await page.getByText('Second synthetic section.', { exact: true }).waitFor();
  check(await owner.from('reading_list').insert({ user_id: users[0], document_id: document.id }));
  assert.deepEqual(check(await other.from('reading_list').select('id').eq('document_id', document.id)), []);
  check(await owner.from('reading_list').delete().eq('document_id', document.id));
  assert.equal(check(await owner.from('reading_list').select('id').eq('document_id', document.id)).length, 0);
  check(await owner.from('documents').update({ visibility: 'shared' }).eq('id', document.id));
  assert.equal(check(await other.from('documents').select('id').eq('id', document.id)).length, 1);
  check(await other.from('documents').update({ title: 'forged' }).eq('id', document.id));
  assert.equal(check(await owner.from('documents').select('title').eq('id', document.id)).at(0).title, 'Local quality fixture');
  check(await other.storage.from('documents').createSignedUrl(document.file_storage_path, 60));
  const invalidId = randomUUID(), invalidPath = `${users[0]}/${invalidId}.pdf`;
  paths.push(invalidPath);
  check(await owner.storage.from('documents').upload(invalidPath, new Blob(['not a PDF'], { type: 'application/pdf' })));
  const rejected = await owner.functions.invoke('finalize-user-document-upload', { body: { document: { ...document, id: invalidId, file_storage_path: invalidPath, file_name: 'invalid.pdf', file_format: 'pdf', cover_storage_path: null } } });
  assert.ok(rejected.error, 'The real finalizer must reject forged PDF bytes');
  assert.deepEqual(check(await owner.from('documents').select('id').eq('id', invalidId)), []);
  await page.goto(origin + '/');
  await page.getByRole('button', { name: new RegExp('owner-' + suffix) }).click();
  await page.getByRole('button', { name: 'Log Out', exact: true }).click();
  await page.locator('#auth-email').waitFor();
  console.log('PASS: local sign-in/out, UI upload/finalization, TXT resume, bookmark persistence, Reading List isolation, shared/private storage and forged-file rejection.');
} finally {
  await browser?.close();
  await server.close();
  // Admin cleanup is restricted to IDs and paths created by this run.
  if (documents.length) check(await admin.from('documents').delete().in('id', documents));
  if (paths.length) check(await admin.storage.from('documents').remove(paths));
  for (const id of users) check(await admin.auth.admin.deleteUser(id));
  await owner.auth.signOut(); await other.auth.signOut();
}

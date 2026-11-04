import assert from 'node:assert/strict';
import { test } from 'node:test';
import { parseRoute, routePath, safeReturnPath, normalizeBase, viewPaths } from '../src/domain/navigation.ts';
const id = '81000000-0000-4000-8000-000000000001';
test('every view and document identity round trips at root and subdirectory bases', () => {
  for (const base of ['/', '/lumiere/']) {
    for (const view of Object.keys(viewPaths) as (keyof typeof viewPaths)[]) {
      assert.deepEqual(parseRoute(routePath({kind:'view',view},base),base),{kind:'view',view});
    }
    assert.deepEqual(parseRoute(routePath({kind:'reader',documentId:id},base),base),{kind:'reader',documentId:id});
    assert.deepEqual(parseRoute(routePath({kind:'callback'},base),base),{kind:'callback'});
  }
});
test('malformed IDs, foreign base prefixes and unknown paths cannot become reader routes', () => {
  for (const p of ['/read/bad','/read/%2F','/read/'+id+'/extra','/unknown']) assert.equal(parseRoute(p).kind,'not-found');
  assert.equal(parseRoute('/lumiere-other/bookmarks','/lumiere/').kind,'not-found');
  assert.deepEqual(parseRoute('/lumiere','/lumiere/'),{kind:'view',view:'library'});
  assert.throws(() => routePath({kind:'reader',documentId:'bad'}));
});
test('OAuth return paths accept only known same-app paths', () => {
  assert.equal(safeReturnPath('/lumiere/read/'+id,'/lumiere/'),'/lumiere/read/'+id);
  for (const p of ['https://evil.test','//evil.test','/\\evil','/lumiere/../profile','/lumiere/auth/callback','/lumiere/profile?next=https://evil.test','/profile',null]) {
    assert.equal(safeReturnPath(p,'/lumiere/'),null);
  }
  for (const base of ['https://site.test/','//site/','/a/../','/a?b','/a%2f']) assert.throws(()=>normalizeBase(base));
});

import assert from 'node:assert/strict';
import test from 'node:test';
import { isCatalogAdmin } from '../src/lib/catalogAdminAccess.ts';

test('only the trusted app_metadata admin role grants catalog maintenance access', () => {
  assert.equal(isCatalogAdmin({ app_metadata: { role: 'admin' } }), true);
  assert.equal(isCatalogAdmin({ app_metadata: { role: 'user' } }), false);
  assert.equal(isCatalogAdmin({ app_metadata: {} }), false);
  assert.equal(isCatalogAdmin(null), false);
});

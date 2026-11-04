import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ProgressStore } from '../src/features/reader/progress/progress-store.ts';
import type { ProgressRow } from '../src/domain/progress.ts';
test('progress repository is injected, loads deduplicate and disposed late errors stay invisible', async () => {
  let calls = 0;
  let reject!: (error: Error) => void;
  const store = new ProgressStore('account-a', {
    list: () => { calls++; return new Promise<ProgressRow[]>((_resolve, fail) => { reject = fail; }); },
    save: async () => ({ accepted: false, row: null }),
  }, { read: () => null, write: () => {}, remove: () => {}, documentIds: () => [] });
  const request = store.load();
  assert.equal(store.load(), request);
  assert.equal(calls, 1);
  store.dispose();
  reject(new Error('stale failure'));
  await request;
  assert.equal(store.error, null);
});

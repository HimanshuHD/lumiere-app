import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { getSignedUrlRefreshDelay } from '../src/hooks/documentStorageUrlRefresh.ts';

const minute = 60_000;

describe('getSignedUrlRefreshDelay', () => {
  it('schedules staggered mounts from the cached URL refresh deadline', () => {
    const refreshAt = 12 * minute;

    assert.equal(getSignedUrlRefreshDelay(refreshAt, 0), 12 * minute);
    assert.equal(getSignedUrlRefreshDelay(refreshAt, 11 * minute), minute);
  });

  it('refreshes immediately when a reopened view reuses a URL at its deadline', () => {
    const refreshAt = 12 * minute;

    assert.equal(getSignedUrlRefreshDelay(refreshAt, 12 * minute), 0);
    assert.equal(getSignedUrlRefreshDelay(refreshAt, 14 * minute), 0);
  });
});

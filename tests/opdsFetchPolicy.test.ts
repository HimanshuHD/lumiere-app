import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BOOK_DOWNLOAD_BYTES,
  MAX_FEED_RESPONSE_BYTES,
  MAX_REDIRECTS,
  REQUEST_TIMEOUT_MS,
  validateOutboundUrl,
} from '../supabase/functions/opds-fetch/security.ts';

describe('validateOutboundUrl', () => {
  it('accepts curated catalogs and user-entered HTTPS feed hosts', () => {
    for (const value of [
      'https://m.gutenberg.org/ebooks.opds/',
      'https://catalog.feedbooks.com/catalog/index.atom',
      'https://feeds.example.org/books.atom',
      'https://feeds.example.org:443/books.atom',
    ]) {
      assert.equal(validateOutboundUrl(value).ok, true, value);
    }
  });

  it('rejects insecure URLs, credentials, and nonstandard ports', () => {
    for (const value of [
      'http://feeds.example.org/books.atom',
      'https://user:password@feeds.example.org/books.atom',
      'https://feeds.example.org:8443/books.atom',
      'ftp://feeds.example.org/books.atom',
    ]) {
      assert.equal(validateOutboundUrl(value).ok, false, value);
    }
  });

  it('rejects IP literals and local or special-use hostnames', () => {
    for (const value of [
      'https://127.0.0.1/feed',
      'https://192.168.1.1/feed',
      'https://[::1]/feed',
      'https://localhost/feed',
      'https://printer.local/feed',
      'https://service.internal/feed',
      'https://example.test/feed',
    ]) {
      assert.equal(validateOutboundUrl(value).ok, false, value);
    }
  });

  it('rejects malformed URLs and unqualified hostnames', () => {
    assert.equal(validateOutboundUrl('not a URL').ok, false);
    assert.equal(validateOutboundUrl('https://intranet/feed').ok, false);
  });
});

describe('OPDS request limits', () => {
  it('defines bounded request and response limits', () => {
    assert.equal(MAX_REDIRECTS, 5);
    assert.equal(REQUEST_TIMEOUT_MS, 15_000);
    assert.equal(MAX_FEED_RESPONSE_BYTES, 2 * 1024 * 1024);
    assert.equal(MAX_BOOK_DOWNLOAD_BYTES, 30 * 1024 * 1024);
  });
});

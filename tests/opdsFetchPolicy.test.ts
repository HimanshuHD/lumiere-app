import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BOOK_DOWNLOAD_BYTES,
  MAX_FEED_RESPONSE_BYTES,
  MAX_REDIRECTS,
  REQUEST_TIMEOUT_MS,
  fetchWithValidatedRedirects,
  isPublicIpAddress,
  validateResolvedOutboundUrl,
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

describe('public DNS destination validation', () => {
  it('accepts public IPv4 and global IPv6 addresses', () => {
    for (const address of ['93.184.216.34', '2606:4700:4700::1111', '2001:4860:4860::8888']) {
      assert.equal(isPublicIpAddress(address), true, address);
    }
  });

  it('rejects private, reserved, and malformed IP addresses', () => {
    for (const address of [
      '0.1.2.3',
      '10.0.0.1',
      '100.64.0.1',
      '127.0.0.1',
      '169.254.1.1',
      '172.16.0.1',
      '192.168.1.1',
      '198.18.0.1',
      '203.0.113.1',
      '224.0.0.1',
      '::1',
      'fc00::1',
      'fe80::1',
      '2001:db8::1',
      '2002::1',
      'not-an-address',
    ]) {
      assert.equal(isPublicIpAddress(address), false, address);
    }
  });

  it('requires all DNS answers to be public and rejects empty or failed lookups', async () => {
    const publicResolver = async (_hostname: string, type: 'A' | 'AAAA') =>
      type === 'A' ? ['93.184.216.34'] : [];
    assert.equal(
      (await validateResolvedOutboundUrl('https://feeds.example.org/feed', publicResolver)).ok,
      true,
    );

    const privateResolver = async (_hostname: string, type: 'A' | 'AAAA') =>
      type === 'A' ? ['93.184.216.34', '10.0.0.1'] : [];
    assert.equal(
      (await validateResolvedOutboundUrl('https://feeds.example.org/feed', privateResolver)).ok,
      false,
    );
    assert.equal(
      (await validateResolvedOutboundUrl('https://feeds.example.org/feed', async () => [])).ok,
      false,
    );
    assert.equal(
      (await validateResolvedOutboundUrl('https://feeds.example.org/feed', async () => {
        throw new Error('DNS unavailable');
      })).ok,
      false,
    );
  });
});

describe('validated redirect fetching', () => {
  const publicResolver = async (_hostname: string, type: 'A' | 'AAAA') =>
    type === 'A' ? ['93.184.216.34'] : [];

  it('rejects a redirect to a prohibited address before fetching it', async () => {
    const fetched: string[] = [];
    await assert.rejects(
      fetchWithValidatedRedirects('https://feeds.example.org/feed', {}, {
        resolveDns: publicResolver,
        fetcher: async (url) => {
          fetched.push(url.href);
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://127.0.0.1/admin' },
          });
        },
      }),
      /public hostname/,
    );
    assert.deepEqual(fetched, ['https://feeds.example.org/feed']);
  });

  it('checks hostname allowlists on every redirect', async () => {
    const fetched: string[] = [];
    await assert.rejects(
      fetchWithValidatedRedirects('https://catalog.example.org/feed', {}, {
        isAllowedUrl: (url) => url.hostname === 'catalog.example.org',
        resolveDns: publicResolver,
        fetcher: async (url) => {
          fetched.push(url.href);
          return new Response(null, {
            status: 302,
            headers: { Location: 'https://other.example.org/feed' },
          });
        },
      }),
      /not an approved destination/,
    );
    assert.deepEqual(fetched, ['https://catalog.example.org/feed']);
  });

  it('follows validated redirects up to the configured limit', async () => {
    let requestCount = 0;
    const result = await fetchWithValidatedRedirects('https://feeds.example.org/1', {}, {
      resolveDns: publicResolver,
      fetcher: async (url) => {
        requestCount += 1;
        if (url.pathname === '/1') {
          return new Response(null, { status: 302, headers: { Location: '/2' } });
        }
        return new Response('feed');
      },
    });
    assert.equal(result.url.pathname, '/2');
    assert.equal(await result.response.text(), 'feed');
    assert.equal(requestCount, 2);
  });

  it('rejects redirects beyond the configured limit', async () => {
    await assert.rejects(
      fetchWithValidatedRedirects('https://feeds.example.org/1', {}, {
        maxRedirects: 1,
        resolveDns: publicResolver,
        fetcher: async (url) => new Response(null, {
          status: 302,
          headers: { Location: `${url.pathname}next` },
        }),
      }),
      /exceeded the allowed number of redirects/,
    );
  });
});

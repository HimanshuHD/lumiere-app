import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  MAX_BOOK_DOWNLOAD_BYTES,
  MAX_FEED_RESPONSE_BYTES,
  MAX_REDIRECTS,
  MAX_REQUESTS_PER_IP_PER_MINUTE,
  REQUEST_TIMEOUT_MS,
  DEFAULT_REQUESTS_PER_IP_PER_MINUTE,
  OutboundResponseError,
  detectSupportedBookFormat,
  fetchWithValidatedRedirects,
  getClientIp,
  hashClientIp,
  isPublicIpAddress,
  readResponseBytes,
  readResponseText,
  validateResolvedOutboundUrl,
  validateOutboundUrl,
  verifyTurnstileToken,
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
    assert.equal(DEFAULT_REQUESTS_PER_IP_PER_MINUTE, 5);
    assert.equal(MAX_REQUESTS_PER_IP_PER_MINUTE, 100);
  });
});

describe('browse abuse controls', () => {
  it('extracts a client IP from platform forwarding headers and rejects malformed values', () => {
    assert.equal(getClientIp(new Headers({ 'cf-connecting-ip': '203.0.113.42' })), '203.0.113.42');
    assert.equal(getClientIp(new Headers({ 'x-forwarded-for': '198.51.100.10, 10.0.0.4' })), '198.51.100.10');
    assert.equal(getClientIp(new Headers({ 'cf-connecting-ip': '300.1.1.1' })), null);
    assert.equal(getClientIp(new Headers()), null);
  });

  it('creates stable, opaque per-IP rate-limit keys', async () => {
    const first = await hashClientIp('203.0.113.42', 'service-role-secret');
    const second = await hashClientIp('203.0.113.42', 'service-role-secret');
    const otherIp = await hashClientIp('203.0.113.43', 'service-role-secret');
    const otherSecret = await hashClientIp('203.0.113.42', 'other-secret');
    assert.match(first, /^[0-9a-f]{64}$/);
    assert.equal(first, second);
    assert.notEqual(first, otherIp);
    assert.notEqual(first, otherSecret);
  });

  it('accepts only successful Turnstile tokens bound to the expected host and action', async () => {
    const validResponse = async (_url: string | URL | Request, init?: RequestInit) => {
      assert.equal(new URLSearchParams(String(init?.body)).get('remoteip'), '203.0.113.42');
      return Response.json({
        success: true,
        hostname: 'reader.example.org',
        action: 'opds_browse',
      });
    };
    assert.equal(
      await verifyTurnstileToken('valid-token', 'secret', '203.0.113.42', 'reader.example.org', validResponse),
      true,
    );
    assert.equal(
      await verifyTurnstileToken('valid-token', 'secret', '203.0.113.42', 'other.example.org', validResponse),
      false,
    );
    assert.equal(
      await verifyTurnstileToken('valid-token', 'secret', '203.0.113.42', 'reader.example.org', async () =>
        Response.json({ success: true, hostname: 'reader.example.org', action: 'other' })),
      false,
    );
    assert.equal(
      await verifyTurnstileToken('', 'secret', '203.0.113.42', 'reader.example.org', validResponse),
      false,
    );
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

  it('aborts a stalled outbound request at its timeout', async () => {
    await assert.rejects(
      fetchWithValidatedRedirects('https://feeds.example.org/feed', {}, {
        timeoutMs: 10,
        resolveDns: publicResolver,
        fetcher: (_url, init) => new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true });
        }),
      }),
      (error: unknown) => error instanceof OutboundResponseError && error.reason === 'timeout',
    );
  });
});

describe('bounded response reading', () => {
  it('reads text and bytes while enforcing Content-Length and streamed limits', async () => {
    assert.equal(await readResponseText(new Response('<feed/>'), 16), '<feed/>');
    await assert.rejects(
      readResponseBytes(new Response('too large', {
        headers: { 'Content-Length': '9' },
      }), 8),
      (error: unknown) => error instanceof OutboundResponseError && error.reason === 'too_large',
    );

    const streamed = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new Uint8Array(4));
        controller.enqueue(new Uint8Array(5));
        controller.close();
      },
    }));
    await assert.rejects(
      readResponseBytes(streamed, 8),
      (error: unknown) => error instanceof OutboundResponseError && error.reason === 'too_large',
    );
  });

  it('terminates stalled response bodies within the timeout', async () => {
    const response = new Response(new ReadableStream({
      pull() {
        return new Promise<void>(() => undefined);
      },
    }));
    await assert.rejects(
      readResponseBytes(response, 16, 10),
      (error: unknown) => error instanceof OutboundResponseError && error.reason === 'timeout',
    );
  });

  it('applies the body timeout to the whole response, not each individual chunk', async () => {
    const response = new Response(new ReadableStream({
      async start(controller) {
        controller.enqueue(new Uint8Array([1]));
        await new Promise((resolve) => setTimeout(resolve, 8));
        controller.enqueue(new Uint8Array([2]));
        await new Promise((resolve) => setTimeout(resolve, 8));
        controller.enqueue(new Uint8Array([3]));
        controller.close();
      },
    }));
    await assert.rejects(
      readResponseBytes(response, 16, 12),
      (error: unknown) => error instanceof OutboundResponseError && error.reason === 'timeout',
    );
  });
});

describe('supported book file validation', () => {
  const makeEpub = (fileName = 'mimetype', content = 'application/epub+zip') => {
    const name = new TextEncoder().encode(fileName);
    const body = new TextEncoder().encode(content);
    const header = new Uint8Array(30 + name.length + body.length);
    const view = new DataView(header.buffer);
    header.set([0x50, 0x4b, 0x03, 0x04]);
    view.setUint16(8, 0, true);
    view.setUint32(18, body.length, true);
    view.setUint32(22, body.length, true);
    view.setUint16(26, name.length, true);
    view.setUint16(28, 0, true);
    header.set(name, 30);
    header.set(body, 30 + name.length);
    return header;
  };

  it('recognizes a valid EPUB mimetype header and a PDF header', () => {
    assert.equal(detectSupportedBookFormat(makeEpub()), 'epub');
    assert.equal(detectSupportedBookFormat(new TextEncoder().encode('%PDF-1.7\n')), 'pdf');
    const pdfWithPreamble = new Uint8Array(32);
    pdfWithPreamble.set(new TextEncoder().encode('%PDF-2.0'), 16);
    assert.equal(detectSupportedBookFormat(pdfWithPreamble), 'pdf');
  });

  it('rejects MIME-type- or extension-only matches and malformed file headers', () => {
    assert.equal(detectSupportedBookFormat(new TextEncoder().encode('<html>not a PDF</html>')), null);
    assert.equal(detectSupportedBookFormat(new Uint8Array([0x50, 0x4b, 0x03, 0x04])), null);
    assert.equal(detectSupportedBookFormat(makeEpub('content.opf')), null);
    assert.equal(detectSupportedBookFormat(makeEpub('mimetype', 'text/plain')), null);
    assert.equal(detectSupportedBookFormat(new TextEncoder().encode('%PDF-invalid')), null);
  });
});

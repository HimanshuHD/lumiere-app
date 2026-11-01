export const MAX_REDIRECTS = 5;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_FEED_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_BOOK_DOWNLOAD_BYTES = 30 * 1024 * 1024;

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

export type OutboundUrlValidation =
  | { ok: true; url: URL }
  | { ok: false; error: string };

type DnsRecordType = "A" | "AAAA";
export type DnsResolver = (hostname: string, recordType: DnsRecordType) => Promise<string[]>;
type Fetcher = (input: URL, init: RequestInit) => Promise<Response>;

export interface ValidatedFetchOptions {
  maxRedirects?: number;
  isAllowedUrl?: (url: URL) => boolean;
  resolveDns?: DnsResolver;
  fetcher?: Fetcher;
  timeoutMs?: number;
}

export interface ValidatedFetchResult {
  response: Response;
  url: URL;
}

export class OutboundResponseError extends Error {
  readonly reason: "too_large" | "timeout";

  constructor(reason: "too_large" | "timeout") {
    super(reason === "too_large" ? "Outbound response exceeded its size limit." : "Outbound request timed out.");
    this.name = "OutboundResponseError";
    this.reason = reason;
  }
}

export function validateOutboundUrl(value: string | URL): OutboundUrlValidation {
  let url: URL;
  try {
    url = value instanceof URL ? new URL(value) : new URL(value);
  } catch {
    return { ok: false, error: "Invalid URL provided." };
  }

  const hostname = url.hostname.toLowerCase();
  const isIpLiteral = hostname.includes(":") || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname);
  const isLocalHostname = hostname === "localhost" ||
    [".localhost", ".local", ".internal", ".test", ".invalid", ".example", ".onion", ".arpa"]
      .some((suffix) => hostname.endsWith(suffix));

  if (url.protocol !== "https:") {
    return { ok: false, error: "Catalog URLs must use HTTPS." };
  }
  if (url.username || url.password) {
    return { ok: false, error: "Catalog URLs cannot contain credentials." };
  }
  if (url.port && url.port !== "443") {
    return { ok: false, error: "Catalog URLs must use the standard HTTPS port." };
  }
  if (!hostname.includes(".") || isIpLiteral || isLocalHostname) {
    return { ok: false, error: "Catalog URLs must use a public hostname." };
  }

  return { ok: true, url };
}

export function isPublicIpAddress(address: string): boolean {
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(address)) {
    const octets = address.split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const [first, second, third] = octets;
    return !(
      first === 0 ||
      first === 10 ||
      first === 100 && second >= 64 && second <= 127 ||
      first === 127 ||
      first === 169 && second === 254 ||
      first === 172 && second >= 16 && second <= 31 ||
      first === 192 && second === 0 && third === 0 ||
      first === 192 && second === 0 && third === 2 ||
      first === 192 && second === 88 && third === 99 ||
      first === 192 && second === 168 ||
      first === 198 && (second === 18 || second === 19) ||
      first === 198 && second === 51 && third === 100 ||
      first === 203 && second === 0 && third === 113 ||
      first >= 224
    );
  }

  const normalized = address.replace(/^\[|\]$/g, "");
  if (!normalized.includes(":")) return false;

  const embeddedIpv4 = normalized.match(/(?:^|:)(\d{1,3}(?:\.\d{1,3}){3})$/);
  let ipv6Address = normalized;
  if (embeddedIpv4) {
    const octets = embeddedIpv4[1].split(".").map(Number);
    if (octets.some((octet) => octet > 255)) return false;
    const ipv4Groups = [
      (octets[0] << 8) | octets[1],
      (octets[2] << 8) | octets[3],
    ];
    ipv6Address = normalized.slice(0, -embeddedIpv4[1].length) +
      ipv4Groups.map((group) => group.toString(16)).join(":");
  }

  const halves = ipv6Address.split("::");
  if (halves.length > 2) return false;
  const left = halves[0] ? halves[0].split(":") : [];
  const right = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  if ([...left, ...right].some((group) => !/^[\da-f]{1,4}$/i.test(group))) return false;
  if (halves.length === 1 && left.length !== 8) return false;
  if (halves.length === 2 && left.length + right.length >= 8) return false;
  const groups = halves.length === 1
    ? left.map((group) => parseInt(group, 16))
    : [
      ...left.map((group) => parseInt(group, 16)),
      ...Array(8 - left.length - right.length).fill(0),
      ...right.map((group) => parseInt(group, 16)),
    ];

  const firstGroup = groups[0];
  const isGlobalUnicast = firstGroup >= 0x2000 && firstGroup <= 0x3fff;
  const isDocumentation = firstGroup === 0x2001 && groups[1] === 0x0db8;
  const isProtocolAssignment = firstGroup === 0x2001 && groups[1] <= 0x01ff;
  const isSixToFour = firstGroup === 0x2002;
  return isGlobalUnicast && !isDocumentation && !isProtocolAssignment && !isSixToFour;
}

async function resolveDns(hostname: string, recordType: DnsRecordType): Promise<string[]> {
  try {
    return await Deno.resolveDns(hostname, recordType);
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) return [];
    throw error;
  }
}

export async function validateResolvedOutboundUrl(
  value: string | URL,
  resolver: DnsResolver = resolveDns,
): Promise<OutboundUrlValidation> {
  const validation = validateOutboundUrl(value);
  if (!validation.ok) return validation;

  let records: string[];
  try {
    const [ipv4, ipv6] = await Promise.all([
      resolver(validation.url.hostname, "A"),
      resolver(validation.url.hostname, "AAAA"),
    ]);
    records = [...ipv4, ...ipv6];
  } catch {
    return { ok: false, error: "Could not verify the catalog host's public address." };
  }

  if (records.length === 0 || records.some((address) => !isPublicIpAddress(address))) {
    return { ok: false, error: "Catalog host resolves to a prohibited address." };
  }
  return validation;
}

export async function fetchWithValidatedRedirects(
  value: string | URL,
  init: RequestInit,
  options: ValidatedFetchOptions = {},
): Promise<ValidatedFetchResult> {
  const maxRedirects = options.maxRedirects ?? MAX_REDIRECTS;
  const timeoutMs = options.timeoutMs ?? REQUEST_TIMEOUT_MS;
  const isAllowedUrl = options.isAllowedUrl ?? (() => true);
  const fetcher = options.fetcher ?? fetch;
  const resolver = options.resolveDns ?? resolveDns;
  let url = value instanceof URL ? new URL(value) : new URL(value);

  for (let redirectCount = 0; ; redirectCount += 1) {
    const validation = await validateResolvedOutboundUrl(url, resolver);
    if (!validation.ok || !isAllowedUrl(validation.url)) {
      throw new Error(validation.ok ? "Outbound URL is not an approved destination." : validation.error);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetcher(validation.url, {
        ...init,
        signal: controller.signal,
        redirect: "manual",
      });
    } catch (error) {
      if (controller.signal.aborted) throw new OutboundResponseError("timeout");
      throw error;
    } finally {
      clearTimeout(timeout);
    }
    if (!REDIRECT_STATUSES.has(response.status)) return { response, url: validation.url };

    const location = response.headers.get("Location");
    if (!location || redirectCount >= maxRedirects) {
      await response.body?.cancel();
      throw new Error("The catalog exceeded the allowed number of redirects.");
    }

    let nextUrl: URL;
    try {
      nextUrl = new URL(location, validation.url);
    } catch {
      await response.body?.cancel();
      throw new Error("The catalog returned an invalid redirect.");
    }
    await response.body?.cancel();
    url = nextUrl;
  }
}

export async function readResponseBytes(
  response: Response,
  maxBytes: number,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<Uint8Array> {
  const contentLength = response.headers.get("Content-Length");
  if (contentLength !== null) {
    if (!/^\d+$/.test(contentLength)) throw new Error("Outbound response had an invalid content length.");
    if (Number(contentLength) > maxBytes) throw new OutboundResponseError("too_large");
  }

  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();

  const chunks: Uint8Array[] = [];
  let totalBytes = 0;
  let timeout: ReturnType<typeof setTimeout>;
  const timedOut = new Promise<never>((_, reject) => {
    timeout = setTimeout(() => reject(new OutboundResponseError("timeout")), timeoutMs);
  });
  try {
    while (true) {
      const { done, value } = await Promise.race([reader.read(), timedOut]);
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) throw new OutboundResponseError("too_large");
      chunks.push(value);
    }
  } catch (error) {
    clearTimeout(timeout);
    await reader.cancel(error).catch(() => undefined);
    throw error;
  } finally {
    clearTimeout(timeout);
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

export async function readResponseText(
  response: Response,
  maxBytes = MAX_FEED_RESPONSE_BYTES,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<string> {
  return new TextDecoder().decode(await readResponseBytes(response, maxBytes, timeoutMs));
}

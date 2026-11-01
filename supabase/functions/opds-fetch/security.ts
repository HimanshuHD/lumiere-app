export const MAX_REDIRECTS = 5;
export const REQUEST_TIMEOUT_MS = 15_000;
export const MAX_FEED_RESPONSE_BYTES = 2 * 1024 * 1024;
export const MAX_BOOK_DOWNLOAD_BYTES = 30 * 1024 * 1024;

export type OutboundUrlValidation =
  | { ok: true; url: URL }
  | { ok: false; error: string };

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

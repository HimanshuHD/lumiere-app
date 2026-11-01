import { XMLParser, XMLValidator } from "npm:fast-xml-parser@4.5.3";
import { createClient } from "npm:@supabase/supabase-js@2";
import {
  MAX_BOOK_DOWNLOAD_BYTES,
  MAX_FEED_RESPONSE_BYTES,
  OutboundResponseError,
  detectSupportedBookFormat,
  DEFAULT_TURNSTILE_ACTION,
  fetchWithValidatedRedirects,
  DEFAULT_REQUESTS_PER_IP_PER_MINUTE,
  getClientIp,
  hashClientIp,
  MAX_REQUESTS_PER_IP_PER_MINUTE,
  readResponseBytes,
  readResponseText,
  validateOutboundUrl,
  verifyTurnstileToken,
} from "./security.ts";

type XmlRecord = Record<string, unknown>;

function logInternalError(operation: string, error: unknown): void {
  console.error(`[opds-fetch] ${operation} failed`, error);
}

function jsonError(
  message: string,
  status: number,
  corsHeaders: Record<string, string>,
  extraHeaders: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...corsHeaders, ...extraHeaders, "Content-Type": "application/json" },
  });
}

async function authorizeCatalogBrowse(
  req: Request,
  corsHeaders: Record<string, string>,
): Promise<Response | null> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    logInternalError("browse rate-limit configuration", "Missing Supabase environment variables.");
    return jsonError("Catalog browsing is temporarily unavailable.", 503, corsHeaders);
  }

  const clientIp = getClientIp(req.headers);
  if (!clientIp) {
    return jsonError("Catalog browsing could not verify the request source.", 400, corsHeaders);
  }

  const quotaValue = Deno.env.get("OPDS_REQUESTS_PER_IP_PER_MINUTE") ??
    String(DEFAULT_REQUESTS_PER_IP_PER_MINUTE);
  const quota = Number(quotaValue);
  if (
    !Number.isInteger(quota) ||
    quota < 1 ||
    quota > MAX_REQUESTS_PER_IP_PER_MINUTE
  ) {
    logInternalError("browse rate-limit configuration", "Invalid request quota.");
    return jsonError("Catalog browsing is temporarily unavailable.", 503, corsHeaders);
  }

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  let ipHash: string;
  try {
    ipHash = await hashClientIp(clientIp, serviceRoleKey);
  } catch (error) {
    logInternalError("browse client identifier", error);
    return jsonError("Catalog browsing is temporarily unavailable.", 503, corsHeaders);
  }
  const { data: withinQuota, error: rateLimitError } = await admin.rpc(
    "consume_opds_feed_rate_limit",
    { p_client_ip_hash: ipHash, p_max_requests: quota },
  );
  if (rateLimitError) {
    logInternalError("browse rate-limit check", rateLimitError);
    return jsonError("Catalog browsing is temporarily unavailable.", 503, corsHeaders);
  }
  if (withinQuota !== true) {
    return jsonError("Catalog request limit reached. Try again in a minute.", 429, corsHeaders, {
      "Retry-After": "60",
    });
  }

  const authorization = req.headers.get("Authorization");
  let isAuthenticated = false;
  if (authorization) {
    const accessToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1];
    if (!accessToken) return jsonError("A valid sign-in session is required.", 401, corsHeaders);

    const userClient = createClient(supabaseUrl, anonKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });
    const { data, error } = await userClient.auth.getUser(accessToken);
    if (error || !data.user) return jsonError("Your sign-in session is invalid or expired.", 401, corsHeaders);
    isAuthenticated = true;
  }

  if (isAuthenticated) return null;

  const turnstileSecret = Deno.env.get("TURNSTILE_SECRET_KEY");
  const expectedHostname = Deno.env.get("TURNSTILE_EXPECTED_HOSTNAME");
  const expectedAction = Deno.env.get("TURNSTILE_EXPECTED_ACTION") ?? DEFAULT_TURNSTILE_ACTION;
  const turnstileToken = req.headers.get("X-Turnstile-Token") || "";
  if (!turnstileSecret || !expectedHostname || !expectedAction) {
    logInternalError("Turnstile configuration", "Missing Turnstile environment variables.");
    return jsonError("Public catalog browsing is temporarily unavailable.", 503, corsHeaders);
  }
  try {
    const verified = await verifyTurnstileToken(
      turnstileToken,
      turnstileSecret,
      clientIp,
      expectedHostname,
      fetch,
      expectedAction,
    );
    if (!verified) return jsonError("Complete the security check before browsing catalogs.", 403, corsHeaders);
  } catch (error) {
    logInternalError("Turnstile verification", error);
    return jsonError("The security check is temporarily unavailable.", 503, corsHeaders);
  }
  return null;
}

const parser = new XMLParser({
  attributeNamePrefix: "@_",
  ignoreAttributes: false,
  parseTagValue: false,
  removeNSPrefix: true,
  trimValues: true,
});

const asRecord = (value: unknown): XmlRecord =>
  typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as XmlRecord
    : {};

const childValues = (node: unknown, name: string): unknown[] => {
  const value = asRecord(node)[name];
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
};

const attribute = (node: unknown, name: string): string => {
  const value = asRecord(node)[`@_${name}`];
  return typeof value === "string" ? value : "";
};

const text = (node: unknown): string => {
  if (typeof node === "string" || typeof node === "number") return String(node).trim();
  if (Array.isArray(node)) return node.map(text).filter(Boolean).join(" ");
  if (typeof node !== "object" || node === null) return "";

  const record = node as XmlRecord;
  if (record["#text"] !== undefined) return text(record["#text"]);
  return Object.entries(record)
    .filter(([key]) => !key.startsWith("@_"))
    .map(([, value]) => text(value))
    .filter(Boolean)
    .join(" ");
};

const childText = (node: unknown, name: string): string =>
  text(childValues(node, name)[0]);

async function importCatalogBook(req: Request): Promise<Response> {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
    "Content-Type": "application/json",
  };
  const respond = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: corsHeaders });
  const fail = (message: string, status: number) => respond({ error: message }, status);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!supabaseUrl || !anonKey || !serviceRoleKey) {
    return fail("Catalog import service is not configured.", 500);
  }

  let requestBody: Record<string, unknown>;
  try {
    const body = await req.json();
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      return fail("Invalid catalog import request.", 400);
    }
    requestBody = body as Record<string, unknown>;
  } catch {
    return fail("Invalid catalog import request.", 400);
  }

  const authorization = req.headers.get("Authorization");
  const accessToken = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!accessToken) return fail("Sign in to import catalog books.", 401);

  const userClient = createClient(supabaseUrl, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: authData, error: authError } = await userClient.auth.getUser(accessToken);
  if (authError || !authData.user) return fail("Your sign-in session is invalid or expired.", 401);

  let catalogUrl: URL;
  let requestedBookId: string;
  try {
    catalogUrl = new URL(String(requestBody.catalogUrl || ""));
    requestedBookId = typeof requestBody.bookId === "string" ? requestBody.bookId.trim() : "";
  } catch {
    return fail("Invalid catalog import request.", 400);
  }

  const allowedHosts = new Set([
    "gutenberg.org",
    "www.gutenberg.org",
    "m.gutenberg.org",
    "aleph.gutenberg.org",
  ]);
  const isAllowedUrl = (url: URL) =>
    validateOutboundUrl(url).ok && allowedHosts.has(url.hostname.toLowerCase());
  if (!isAllowedUrl(catalogUrl) || !requestedBookId) {
    return fail("Only verified Project Gutenberg catalog entries can be imported.", 400);
  }

  let feedResult;
  try {
    feedResult = await fetchWithValidatedRedirects(catalogUrl, {
      headers: {
        "Accept": "application/atom+xml, application/xml, text/xml",
        "User-Agent": "Lumiere/1.0 OPDS Reader",
      },
    }, { isAllowedUrl });
  } catch (error) {
    if (error instanceof OutboundResponseError && error.reason === "timeout") {
      return fail("The Project Gutenberg catalog request timed out.", 504);
    }
    return fail("Could not safely fetch the Project Gutenberg catalog.", 502);
  }
  catalogUrl = feedResult.url;
  const feedResponse = feedResult.response;
  if (!feedResponse.ok) return fail("Could not verify the catalog entry with Project Gutenberg.", 502);

  let feedText: string;
  try {
    feedText = await readResponseText(feedResponse);
  } catch (error) {
    if (error instanceof OutboundResponseError && error.reason === "too_large") {
      return fail("Catalog feeds must be smaller than 2 MiB.", 413);
    }
    if (error instanceof OutboundResponseError && error.reason === "timeout") {
      return fail("The Project Gutenberg catalog request timed out.", 504);
    }
    return fail("Could not read the Project Gutenberg catalog feed.", 502);
  }
  const validation = XMLValidator.validate(feedText);
  if (validation !== true) return fail("Project Gutenberg returned an invalid catalog feed.", 502);

  const parsedFeed = asRecord(parser.parse(feedText));
  const root = asRecord(parsedFeed.feed);
  const entry = childValues(root, "entry").find((candidate) =>
    childText(candidate, "id") === requestedBookId
  );
  if (!entry) return fail("This book is not present in the selected Project Gutenberg catalog.", 404);

  const rights = childText(entry, "rights").trim();
  if (!/^public domain in the usa\.?$/i.test(rights)) {
    return fail("This catalog entry does not explicitly permit public-domain redistribution.", 403);
  }

  const links = childValues(entry, "link");
  const acquisition = links.find((link) =>
    attribute(link, "rel").startsWith("http://opds-spec.org/acquisition")
  ) || links.find((link) => attribute(link, "rel") === "enclosure");
  const downloadHref = attribute(acquisition, "href");
  if (!downloadHref) return fail("This catalog entry has no downloadable edition.", 400);

  let downloadUrl: URL;
  try {
    downloadUrl = new URL(downloadHref, catalogUrl);
  } catch {
    return fail("Project Gutenberg returned an invalid download URL.", 502);
  }
  if (!isAllowedUrl(downloadUrl)) {
    return fail("The book file is hosted outside the approved Project Gutenberg domains.", 403);
  }

  const mediaType = attribute(acquisition, "type").toLowerCase();
  const path = downloadUrl.pathname.toLowerCase();
  const format = mediaType.includes("epub") || /\.epub(?:3)?(?:$|[.?])/i.test(path)
    ? "epub"
    : mediaType.includes("pdf") || /\.pdf$/i.test(path)
      ? "pdf"
      : null;
  if (!format) return fail("Only EPUB and PDF editions can be imported.", 415);

  const canonicalSourceUrl = downloadUrl.toString();
  const gutenbergBookId = requestedBookId.match(/\/ebooks\/([0-9]+)(?:$|[?#])/i)?.[1] ||
    canonicalSourceUrl.match(/\/(?:ebooks|cache\/epub)\/([0-9]+)/i)?.[1];
  const sourceIdentity = gutenbergBookId
    ? `project-gutenberg:${gutenbergBookId}`
    : canonicalSourceUrl.split(/[?#]/, 1)[0].replace(/\/+$/, "").toLowerCase();
  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data: existing, error: lookupError } = await admin
    .from("documents")
    .select("*")
    .eq("source_identity", sourceIdentity)
    .eq("origin", "catalog_import")
    .maybeSingle();
  if (lookupError) {
    logInternalError("shared catalog lookup", lookupError);
    return fail("Could not check the shared catalog.", 500);
  }
  if (existing) return respond(existing);
  const { data: legacyDocument, error: legacyLookupError } = await admin
    .from("documents")
    .select("*")
    .eq("source_identity", sourceIdentity)
    .eq("origin", "legacy_unowned")
    .maybeSingle();
  if (legacyLookupError) {
    logInternalError("legacy catalog lookup", legacyLookupError);
    return fail("Could not check legacy catalog records.", 500);
  }

  let fileResult;
  try {
    fileResult = await fetchWithValidatedRedirects(downloadUrl, {
      headers: {
        "Accept": "application/epub+zip, application/pdf, application/octet-stream",
        "User-Agent": "Lumiere/1.0 OPDS Reader",
      },
    }, { isAllowedUrl });
  } catch (error) {
    if (error instanceof OutboundResponseError && error.reason === "timeout") {
      return fail("The Project Gutenberg book download timed out.", 504);
    }
    return fail("Could not safely fetch the Project Gutenberg book.", 502);
  }
  downloadUrl = fileResult.url;
  const fileResponse = fileResult.response;
  if (!fileResponse.ok) return fail(`Project Gutenberg returned status ${fileResponse.status}.`, 502);

  let bytes: Uint8Array;
  try {
    bytes = await readResponseBytes(fileResponse, MAX_BOOK_DOWNLOAD_BYTES);
  } catch (error) {
    if (error instanceof OutboundResponseError && error.reason === "too_large") {
      return fail("Book files must be smaller than 30 MB.", 413);
    }
    if (error instanceof OutboundResponseError && error.reason === "timeout") {
      return fail("The Project Gutenberg book download timed out.", 504);
    }
    return fail("Could not read the Project Gutenberg book file.", 502);
  }
  if (bytes.length === 0) return fail("The catalog returned an empty book file.", 502);
  if (detectSupportedBookFormat(bytes) !== format) {
    return fail("The downloaded file does not match the catalog's declared format.", 415);
  }

  const title = childText(entry, "title") || "Untitled";
  const author = text(childValues(entry, "author")[0]) || "Unknown Author";
  const summary = (childText(entry, "summary") || childText(entry, "content"))
    .replace(/<[^>]*>/g, "")
    .trim();
  const categories = childValues(entry, "category")
    .map((category) => attribute(category, "term") || attribute(category, "label"))
    .filter(Boolean);
  const knownCategories = ["Fiction", "Non-Fiction", "Science", "History", "Technology", "Philosophy", "Adventure"];
  const category = knownCategories.find((known) =>
    categories.some((value) => value.toLowerCase() === known.toLowerCase())
  ) || "Fiction";
  const coverLink = links.find((link) =>
    attribute(link, "rel") === "http://opds-spec.org/image/thumbnail" ||
    attribute(link, "rel") === "thumbnail"
  );
  const coverHref = attribute(coverLink, "href");
  let coverUrl: string | null = null;
  if (coverHref) {
    try {
      const cover = new URL(coverHref, catalogUrl);
      if (cover.protocol === "https:" && allowedHosts.has(cover.hostname.toLowerCase())) {
        coverUrl = cover.toString();
      }
    } catch {
      return fail("Project Gutenberg returned an invalid cover URL.", 502);
    }
  }

  const storagePath = `catalog/${crypto.randomUUID()}.${format}`;
  const contentType = format === "epub" ? "application/epub+zip" : "application/pdf";
  const { error: uploadError } = await admin.storage.from("documents").upload(storagePath, bytes, {
    contentType,
    cacheControl: "900",
  });
  if (uploadError) {
    logInternalError("catalog file upload", uploadError);
    return fail("Could not save the catalog file.", 500);
  }

  const documentValues = {
    title,
    author,
    category,
    cover_url: coverUrl,
    reading_time: 10,
    summary: summary || "Public-domain book imported from Project Gutenberg.",
    chapters: [],
    is_featured: false,
    origin: "catalog_import",
    visibility: "shared",
    uploaded_by: null,
    source_identity: sourceIdentity,
    source_url: canonicalSourceUrl,
    file_storage_path: storagePath,
    cover_storage_path: null,
    file_url: null,
    file_format: format,
    file_name: `${title}.${format}`,
  };

  if (legacyDocument) {
    const { error: auditError } = await admin.from("document_security_migration_audit").insert({
      document_id: legacyDocument.id,
      canonical_document_id: legacyDocument.id,
      file_storage_path: legacyDocument.file_storage_path,
      cover_storage_path: legacyDocument.cover_storage_path,
      reason: "Previous storage paths were recorded before a validated legacy catalog restoration attempt",
    });
    if (auditError) {
      const { error: cleanupError } = await admin.storage.from("documents").remove([storagePath]);
      logInternalError("legacy catalog audit", auditError);
      if (cleanupError) logInternalError("catalog file cleanup after audit failure", cleanupError);
      return fail("Could not restore the verified legacy catalog record.", 500);
    }

    const { data: restoredBook, error: restoreError } = await admin
      .from("documents")
      .update(documentValues)
      .eq("id", legacyDocument.id)
      .eq("origin", "legacy_unowned")
      .select("*")
      .maybeSingle();
    if (restoreError) {
      const { error: cleanupError } = await admin.storage.from("documents").remove([storagePath]);
      const { data: concurrentBook, error: concurrentLookupError } = await admin
        .from("documents")
        .select("*")
        .eq("source_identity", sourceIdentity)
        .eq("origin", "catalog_import")
        .maybeSingle();
      if (concurrentLookupError) {
        logInternalError("concurrent catalog restoration lookup", concurrentLookupError);
        if (cleanupError) logInternalError("catalog file cleanup after restore failure", cleanupError);
        return fail("Could not resolve the catalog restoration.", 500);
      }
      if (concurrentBook && !cleanupError) return respond(concurrentBook);
      if (cleanupError) logInternalError("catalog file cleanup after restore failure", cleanupError);
      if (concurrentBook) {
        return fail("The book is available, but temporary file cleanup failed.", 500);
      }
      logInternalError("legacy catalog restoration", restoreError);
      return fail("Could not restore the verified legacy catalog record.", 500);
    }
    if (restoredBook) return respond(restoredBook);

    const { error: cleanupError } = await admin.storage.from("documents").remove([storagePath]);
    const { data: concurrentBook, error: concurrentLookupError } = await admin
      .from("documents")
      .select("*")
      .eq("source_identity", sourceIdentity)
      .eq("origin", "catalog_import")
      .maybeSingle();
    if (concurrentLookupError) {
      logInternalError("concurrent catalog restoration lookup", concurrentLookupError);
      if (cleanupError) logInternalError("catalog file cleanup after restore race", cleanupError);
      return fail("Could not resolve the catalog restoration.", 500);
    }
    if (concurrentBook && !cleanupError) return respond(concurrentBook);
    if (cleanupError) logInternalError("catalog file cleanup after restore race", cleanupError);
    if (concurrentBook) {
      return fail("The book is available, but temporary file cleanup failed.", 500);
    }
    return fail("The legacy catalog record changed during import.", 409);
  }

  const { data: savedBook, error: insertError } = await admin
    .from("documents")
    .insert(documentValues)
    .select("*")
    .single();

  if (insertError) {
    const { error: cleanupError } = await admin.storage.from("documents").remove([storagePath]);
    const { data: canonical, error: canonicalError } = await admin
      .from("documents")
      .select("*")
      .eq("source_identity", sourceIdentity)
      .maybeSingle();
    if (canonicalError) {
      logInternalError("concurrent catalog import lookup", canonicalError);
      if (cleanupError) logInternalError("catalog file cleanup after insert failure", cleanupError);
      return fail("Could not resolve the catalog import.", 500);
    }
    if (canonical && !cleanupError) return respond(canonical);
    if (cleanupError) logInternalError("catalog file cleanup after insert failure", cleanupError);
    if (canonical) {
      return fail("The book is available, but temporary file cleanup failed.", 500);
    }
    logInternalError("shared catalog insert", insertError);
    return fail("Could not save the shared catalog record.", 500);
  }

  return respond(savedBook);
}

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey, X-Turnstile-Token",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
    if (req.method === "POST") return await importCatalogBook(req);
    if (req.method !== "GET") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const browseAuthorization = await authorizeCatalogBrowse(req, corsHeaders);
    if (browseAuthorization) return browseAuthorization;

    const requestUrl = new URL(req.url);
    const downloadUrl = requestUrl.searchParams.get("download");
    if (downloadUrl) {
      const allowedHosts = [
        "gutenberg.org",
        "standardebooks.org",
        "feedbooks.com",
        "manybooks.net",
        "archive.org",
      ];
      const isAllowedHost = (url: URL) =>
        validateOutboundUrl(url).ok &&
        allowedHosts.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
      const errorResponse = (message: string, status: number) =>
        new Response(JSON.stringify({ error: message }), {
          status,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });

      let currentUrl: URL;
      try {
        currentUrl = new URL(downloadUrl);
      } catch {
        return errorResponse("Invalid book download URL", 400);
      }
      if (!isAllowedHost(currentUrl)) {
        return errorResponse("Downloads are only supported from known OPDS catalog hosts", 400);
      }

      let fileResult;
      try {
        fileResult = await fetchWithValidatedRedirects(currentUrl, {
          headers: {
            "Accept": "application/epub+zip, application/pdf, application/octet-stream, */*",
            "User-Agent": "Lumiere/1.0 OPDS Reader",
          },
        }, { isAllowedUrl: isAllowedHost });
      } catch (error) {
        if (error instanceof OutboundResponseError && error.reason === "timeout") {
          return errorResponse("The book download timed out.", 504);
        }
        return errorResponse("Could not safely fetch the book download.", 502);
      }
      currentUrl = fileResult.url;
      const fileResponse = fileResult.response;

      if (!fileResponse.ok) {
        return errorResponse(`Book source returned status ${fileResponse.status}`, 502);
      }

      let bytes: Uint8Array;
      try {
        bytes = await readResponseBytes(fileResponse, MAX_BOOK_DOWNLOAD_BYTES);
      } catch (error) {
        if (error instanceof OutboundResponseError && error.reason === "too_large") {
          return errorResponse("Book files must be smaller than 30 MB.", 413);
        }
        if (error instanceof OutboundResponseError && error.reason === "timeout") {
          return errorResponse("The book download timed out.", 504);
        }
        return errorResponse("Could not read the book file.", 502);
      }
      if (bytes.length === 0) return errorResponse("The catalog returned an empty book file.", 502);

      const format = detectSupportedBookFormat(bytes);
      if (!format) {
        return errorResponse("The catalog download is not a supported EPUB or PDF file", 415);
      }

      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": format === "epub" ? "application/epub+zip" : "application/pdf",
          "Content-Length": String(bytes.length),
          "Content-Disposition": "attachment",
          "X-Document-Format": format,
          "Access-Control-Expose-Headers": "X-Document-Format",
          "Cache-Control": "no-store",
        },
      });
    }

    const feedUrl = requestUrl.searchParams.get("url");

    if (!feedUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const urlValidation = validateOutboundUrl(feedUrl);
    if (!urlValidation.ok) {
      return new Response(
        JSON.stringify({ error: urlValidation.error }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const parsedFeedUrl = urlValidation.url;

    let feedResult;
    try {
      feedResult = await fetchWithValidatedRedirects(parsedFeedUrl, {
        headers: {
          "Accept": "application/atom+xml, application/xml, text/xml, */*",
          "User-Agent": "Lumiere/1.0 OPDS Reader",
        },
      });
    } catch (error) {
      if (error instanceof OutboundResponseError && error.reason === "timeout") {
        return new Response(
          JSON.stringify({ error: "The catalog feed request timed out." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Could not safely fetch the catalog feed." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const response = feedResult.response;

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Catalog returned status ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseFeedUrl = feedResult.url.toString();
    let xmlText: string;
    try {
      xmlText = await readResponseText(response, MAX_FEED_RESPONSE_BYTES);
    } catch (error) {
      if (error instanceof OutboundResponseError && error.reason === "too_large") {
        return new Response(
          JSON.stringify({ error: "Catalog feeds must be smaller than 2 MiB." }),
          { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      if (error instanceof OutboundResponseError && error.reason === "timeout") {
        return new Response(
          JSON.stringify({ error: "The catalog feed request timed out." }),
          { status: 504, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
      return new Response(
        JSON.stringify({ error: "Could not read the catalog feed." }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const xmlValidation = XMLValidator.validate(xmlText);
    if (xmlValidation !== true) {
      return new Response(
        JSON.stringify({ error: "Invalid XML returned by catalog" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const document = asRecord(parser.parse(xmlText));
    const rootEntry = Object.entries(document).find(([name]) => !name.startsWith("?"));
    if (!rootEntry) {
      return new Response(
        JSON.stringify({ error: "Catalog feed has no root element" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [rootName, root] = rootEntry;
    const resolveUrl = (value: string) => {
      if (!value) return "";
      try {
        const url = new URL(value, baseFeedUrl);
        return url.protocol === "http:" || url.protocol === "https:" ? url.href : "";
      } catch {
        return "";
      }
    };

    if (rootName.toLowerCase() === "rss" || rootName.toLowerCase() === "rdf") {
      const channel = childValues(root, "channel")[0];
      const feedItems = childValues(channel, "item");
      const items = (feedItems.length ? feedItems : childValues(root, "item"))
        .map((item, index) => {
          const enclosure = childValues(item, "enclosure")[0];
          const thumbnail = childValues(item, "thumbnail")[0];
          const mediaContent = childValues(item, "content")[0];
          const image = childValues(item, "image")[0];
          const link = childText(item, "link");
          const description = childText(item, "description") ||
            childText(item, "encoded") || childText(item, "content");
          const categories = childValues(item, "category")
            .map((category) => attribute(category, "term") || text(category))
            .filter(Boolean);

          return {
            title: childText(item, "title") || "Untitled",
            author: childText(item, "creator") || childText(item, "author") || "Unknown Author",
            summary: description.replace(/<[^>]*>/g, "").trim(),
            id: childText(item, "guid") || link || `item-${index}`,
            updated: childText(item, "pubDate") || childText(item, "date"),
            coverUrl: resolveUrl(
              attribute(thumbnail, "url") ||
              attribute(mediaContent, "url") ||
              childText(image, "url"),
            ),
            downloadUrl: resolveUrl(attribute(enclosure, "url") || link),
            downloadType: attribute(enclosure, "type") || (link ? "text/html" : ""),
            catalogUrl: "",
            categories,
            rights: childText(item, "rights"),
          };
        })
        .filter((item) => item.title !== "Untitled" || item.id);

      return new Response(
        JSON.stringify({
          title: childText(channel, "title") || "RSS Feed",
          subtitle: childText(channel, "description"),
          count: items.length,
          books: items,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (rootName.toLowerCase() !== "feed") {
      return new Response(
        JSON.stringify({ error: "Catalog returned an unsupported feed format" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const feedTitle = childText(root, "title") || "Unknown Catalog";
    const feedSubtitle = childText(root, "subtitle");
    const books = childValues(root, "entry")
      .map((entry) => {
        const links = childValues(entry, "link");
        const acquisition = links.find((link) =>
          attribute(link, "rel").startsWith("http://opds-spec.org/acquisition")
        ) || links.find((link) => attribute(link, "rel") === "enclosure");
        const articleLink = links.find((link) =>
          !attribute(link, "rel") || attribute(link, "rel") === "alternate"
        );
        const author = childValues(entry, "author")[0];
        const thumbnail = links.find((link) =>
          attribute(link, "rel") === "http://opds-spec.org/image/thumbnail" ||
          attribute(link, "rel") === "thumbnail"
        ) || links.find((link) => attribute(link, "type").startsWith("image/"));
        const catalog = links.find((link) =>
          attribute(link, "rel") === "subsection" &&
          attribute(link, "type").includes("application/atom+xml")
        ) || links.find((link) => attribute(link, "type").includes("application/atom+xml"));
        const acquisitionLink = attribute(acquisition, "href") ||
          attribute(articleLink, "href");
        const summary = childText(entry, "summary") || childText(entry, "content");

        return {
          title: childText(entry, "title") || "Untitled",
          author: childText(author, "name") || text(author) || "Unknown Author",
          summary: summary.replace(/<[^>]*>/g, "").trim(),
          id: childText(entry, "id"),
          updated: childText(entry, "updated"),
          coverUrl: resolveUrl(attribute(thumbnail, "href")),
          downloadUrl: resolveUrl(acquisitionLink),
          downloadType: attribute(acquisition, "type") ||
            (articleLink && acquisitionLink ? "text/html" : ""),
          catalogUrl: resolveUrl(attribute(catalog, "href")),
          categories: childValues(entry, "category")
            .map((category) => attribute(category, "term") || attribute(category, "label"))
            .filter(Boolean),
          rights: childText(entry, "rights"),
        };
      })
      .filter((book) => book.title !== "Untitled" || book.id);

    return new Response(
      JSON.stringify({
        title: feedTitle,
        subtitle: feedSubtitle,
        count: books.length,
        books,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (err) {
    logInternalError("request handler", err);
    return new Response(
      JSON.stringify({ error: "The catalog request could not be completed." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

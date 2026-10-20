import { XMLParser, XMLValidator } from "npm:fast-xml-parser@4.5.3";

type XmlRecord = Record<string, unknown>;

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

Deno.serve(async (req: Request) => {
  const corsHeaders = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
  };

  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  try {
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
        url.protocol === "https:" &&
        !url.username &&
        !url.password &&
        (!url.port || url.port === "443") &&
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

      let fileResponse: Response | null = null;
      for (let redirectCount = 0; redirectCount <= 5; redirectCount += 1) {
        fileResponse = await fetch(currentUrl, {
          headers: {
            "Accept": "application/epub+zip, application/pdf, application/octet-stream, */*",
            "User-Agent": "Lumiere/1.0 OPDS Reader",
          },
          redirect: "manual",
        });
        if (![301, 302, 303, 307, 308].includes(fileResponse.status)) break;
        const location = fileResponse.headers.get("Location");
        if (!location || redirectCount === 5) {
          return errorResponse("Book download redirected too many times", 502);
        }
        const nextUrl = new URL(location, currentUrl);
        if (!isAllowedHost(nextUrl)) {
          return errorResponse("Book download redirected to an unsupported host", 502);
        }
        currentUrl = nextUrl;
      }

      if (!fileResponse?.ok) {
        return errorResponse(`Book source returned status ${fileResponse?.status ?? 502}`, 502);
      }

      const maxFileSize = 30 * 1024 * 1024;
      const contentLength = Number(fileResponse.headers.get("Content-Length") || 0);
      if (contentLength > maxFileSize) {
        return errorResponse("Book files must be smaller than 30 MB", 413);
      }
      const reader = fileResponse.body?.getReader();
      if (!reader) return errorResponse("The catalog returned an empty book file.", 502);
      const chunks: Uint8Array[] = [];
      let totalBytes = 0;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        totalBytes += value.byteLength;
        if (totalBytes > maxFileSize) {
          await reader.cancel();
          return errorResponse("Book files must be smaller than 30 MB", 413);
        }
        chunks.push(value);
      }
      if (totalBytes === 0) return errorResponse("The catalog returned an empty book file.", 502);
      const bytes = new Uint8Array(totalBytes);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }

      const sourceType = (fileResponse.headers.get("Content-Type") || "")
        .split(";")[0]
        .trim()
        .toLowerCase();
      const path = currentUrl.pathname.toLowerCase();
      const isZip = bytes[0] === 0x50 && bytes[1] === 0x4b;
      const isEpub = isZip &&
        (sourceType.includes("epub") || /\.epub(?:3)?(?:$|[.?])/.test(path));
      const isPdf = sourceType === "application/pdf" ||
        (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);
      if (!isEpub && !isPdf) {
        return errorResponse("The catalog download is not a supported EPUB or PDF file", 415);
      }

      return new Response(bytes, {
        headers: {
          ...corsHeaders,
          "Content-Type": isEpub ? "application/epub+zip" : "application/pdf",
          "Content-Length": String(bytes.length),
          "Content-Disposition": "attachment",
          "X-Document-Format": isEpub ? "epub" : "pdf",
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

    try {
      const parsed = new URL(feedUrl);
      if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
        throw new Error("Invalid protocol");
      }
    } catch {
      return new Response(
        JSON.stringify({ error: "Invalid URL provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const response = await fetch(feedUrl, {
      headers: {
        "Accept": "application/atom+xml, application/xml, text/xml, */*",
        "User-Agent": "Lumiere/1.0 OPDS Reader",
      },
    });

    if (!response.ok) {
      return new Response(
        JSON.stringify({ error: `Catalog returned status ${response.status}` }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const baseFeedUrl = response.url || feedUrl;
    const xmlText = await response.text();
    const validation = XMLValidator.validate(xmlText);
    if (validation !== true) {
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
    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : "An unexpected error occurred" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});

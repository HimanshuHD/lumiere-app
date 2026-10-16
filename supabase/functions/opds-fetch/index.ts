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
    const url = new URL(req.url);
    const feedUrl = url.searchParams.get("url");

    if (!feedUrl) {
      return new Response(
        JSON.stringify({ error: "Missing 'url' query parameter" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Only allow http/https URLs
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

    const xmlText = await response.text();

    // Parse XML using DOMParser (available in Deno)
    const parser = new DOMParser();
    const doc = parser.parseFromString(xmlText, "application/xml");

    if (!doc) {
      return new Response(
        JSON.stringify({ error: "Failed to parse catalog feed" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Check for parser errors
    const parserError = doc.querySelector("parsererror");
    if (parserError) {
      return new Response(
        JSON.stringify({ error: "Invalid XML returned by catalog" }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    // Extract feed-level metadata
    const feedTitle = doc.querySelector("feed > title")?.textContent?.trim() || "Unknown Catalog";
    const feedSubtitle = doc.querySelector("feed > subtitle")?.textContent?.trim() || "";

    // Extract entries (books)
    const entries = Array.from(doc.querySelectorAll("entry"));
    const books = entries.map((entry) => {
      const title = entry.querySelector("title")?.textContent?.trim() || "Untitled";
      const id = entry.querySelector("id")?.textContent?.trim() || "";
      const updated = entry.querySelector("updated")?.textContent?.trim() || "";
      const summary = entry.querySelector("summary")?.textContent?.trim() ||
                      entry.querySelector("content")?.textContent?.trim() || "";

      // Author - can be direct child or inside author element
      const authorName = entry.querySelector("author > name")?.textContent?.trim() ||
                         entry.querySelector("author")?.textContent?.trim() || "Unknown Author";

      // Get cover/thumbnail image
      const thumbnail = entry.querySelector("link[rel='http://opds-spec.org/image/thumbnail']")?.getAttribute("href") ||
                        entry.querySelector("link[rel='thumbnail']")?.getAttribute("href") ||
                        entry.querySelector("link[type^='image']")?.getAttribute("href") || "";

      // Get the acquisition link (download link)
      const acquisitionLink = entry.querySelector("link[rel='http://opds-spec.org/acquisition']")?.getAttribute("href") ||
                              entry.querySelector("link[rel='http://opds-spec.org/acquisition/open-access']")?.getAttribute("href") ||
                              entry.querySelector("link[rel='http://opds-spec.org/acquisition/buy']")?.getAttribute("href") || "";

      // Get the content type/format from the acquisition link
      const acquisitionType = entry.querySelector("link[rel='http://opds-spec.org/acquisition']")?.getAttribute("type") ||
                              entry.querySelector("link[rel='http://opds-spec.org/acquisition/open-access']")?.getAttribute("type") || "";

      // Get categories/tags
      const categories = Array.from(entry.querySelectorAll("category"))
        .map((cat) => cat.getAttribute("term") || cat.getAttribute("label") || "")
        .filter(Boolean);

      return {
        title,
        author: authorName,
        summary: summary.replace(/<[^>]*>/g, "").trim(),
        id,
        updated,
        coverUrl: thumbnail,
        downloadUrl: acquisitionLink,
        downloadType: acquisitionType,
        categories,
      };
    }).filter((book) => book.title !== "Untitled" || book.id);

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

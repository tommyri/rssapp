const FEED_TYPES = [
  "application/rss+xml",
  "application/atom+xml",
  "application/feed+json",
  "application/json",
];

// Paths to probe when a page advertises no <link rel="alternate"> (docs/design-ux.md).
export const COMMON_FEED_PATHS = [
  "/feed",
  "/feed.xml",
  "/rss.xml",
  "/atom.xml",
  "/index.xml",
  "/feed.json",
  "/rss",
];

function attr(tag: string, name: string): string | null {
  const quoted = new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, "i").exec(
    tag,
  );
  if (quoted) return quoted[1];
  const bare = new RegExp(`\\b${name}\\s*=\\s*([^\\s>]+)`, "i").exec(tag);
  return bare ? bare[1] : null;
}

/**
 * Find feed URLs declared in an HTML page's <link rel="alternate"> tags,
 * resolved to absolute URLs against the page URL.
 */
export function discoverFeedLinks(html: string, baseUrl: string): string[] {
  const links: string[] = [];
  for (const match of html.matchAll(/<link\b[^>]*>/gi)) {
    const tag = match[0];
    const rel = attr(tag, "rel")?.toLowerCase();
    if (!rel?.includes("alternate")) continue;
    const type = attr(tag, "type")?.toLowerCase();
    if (!type || !FEED_TYPES.includes(type)) continue;
    const href = attr(tag, "href");
    if (!href) continue;
    try {
      links.push(new URL(href, baseUrl).toString());
    } catch {
      // Skip malformed hrefs.
    }
  }
  return links;
}

export function looksLikeHtml(
  body: string,
  contentType: string | null,
): boolean {
  if (contentType?.includes("html")) return true;
  const head = body.trimStart().slice(0, 200).toLowerCase();
  return head.startsWith("<!doctype html") || head.startsWith("<html");
}

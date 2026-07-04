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

const YT_HOSTS = new Set(["youtube.com", "youtu.be"]);

export function isYouTubeUrl(inputUrl: string): boolean {
  try {
    const host = new URL(inputUrl).hostname.replace(/^(www|m)\./, "");
    return YT_HOSTS.has(host);
  } catch {
    return false;
  }
}

/**
 * YouTube publishes native RSS per channel/playlist but no longer advertises
 * it in page markup. Resolve a pasted YouTube URL to its feed URL — from the
 * URL alone when possible (/channel/, playlists, legacy /user/), or from the
 * channel page's HTML for handle/vanity URLs (docs/features.md v1).
 */
export function youtubeFeedUrl(inputUrl: string, html?: string): string | null {
  if (!isYouTubeUrl(inputUrl)) return null;
  const url = new URL(inputUrl);

  const playlist = url.searchParams.get("list");
  if (playlist) {
    return `https://www.youtube.com/feeds/videos.xml?playlist_id=${encodeURIComponent(playlist)}`;
  }

  const channel = url.pathname.match(/\/channel\/(UC[\w-]+)/);
  if (channel) {
    return `https://www.youtube.com/feeds/videos.xml?channel_id=${channel[1]}`;
  }

  const legacyUser = url.pathname.match(/\/user\/([\w.-]+)/);
  if (legacyUser) {
    return `https://www.youtube.com/feeds/videos.xml?user=${encodeURIComponent(legacyUser[1])}`;
  }

  // Handle (/@name) and vanity (/c/name) URLs: the channel id is only in the
  // page. The canonical link is authoritative — bare "channelId" occurrences
  // can belong to related channels, so they're the last resort.
  if (html) {
    const id =
      html.match(
        /rel="canonical" href="https:\/\/www\.youtube\.com\/channel\/(UC[\w-]+)"/,
      ) ??
      html.match(/itemprop="identifier" content="(UC[\w-]+)"/) ??
      html.match(/"channelId":"(UC[\w-]+)"/);
    if (id) {
      return `https://www.youtube.com/feeds/videos.xml?channel_id=${id[1]}`;
    }
  }
  return null;
}

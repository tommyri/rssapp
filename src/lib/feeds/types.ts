// Normalized shapes the rest of the app depends on, independent of whether the
// source was RSS, Atom, or JSON Feed.

export interface ParsedItem {
  /** Stable per-feed identity for dedup: guid/id, falling back to url, then a hash. */
  guid: string;
  url: string | null;
  title: string | null;
  author: string | null;
  /** Already sanitized HTML, safe to render. */
  contentHtml: string | null;
  /** A playable audio enclosure, when this is a podcast episode. */
  audioUrl: string | null;
  /** The feed-provided MIME type, used as a hint to the native player. */
  audioType: string | null;
  publishedAt: Date | null;
}

export interface ParsedFeed {
  title: string | null;
  siteUrl: string | null;
  description: string | null;
  items: ParsedItem[];
}

import {
  COMMON_FEED_PATHS,
  discoverFeedAlternates,
  type FeedAlternate,
  isYouTubeUrl,
  looksLikeHtml,
  youtubeFeedUrl,
} from "./discover";
import { fetchFeedUrl } from "./fetch";

/**
 * What a pasted URL turned out to be.
 *
 * `feed` is the unambiguous outcome — the URL is itself a feed, or the page
 * advertises exactly one, or a probe found one — and is the only outcome that
 * may subscribe. `candidates` means the page advertised several and the caller
 * has to ask which; nothing is fetched or stored for those, so presenting a
 * picker costs no requests. `none` is a dead end with the reason attached.
 */
export type FeedDiscovery =
  | { status: "feed"; feedUrl: string }
  | { status: "candidates"; candidates: FeedAlternate[] }
  | { status: "none"; error: string };

/** Add a scheme so a pasted "example.com" is still a URL. Mirrors ingest. */
function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/** True when this URL answers with something that is not an HTML page. */
async function respondsAsFeed(candidate: string): Promise<boolean> {
  const res = await fetchFeedUrl(candidate);
  return res.status === "ok" && !looksLikeHtml(res.body, res.contentType);
}

/**
 * Resolve whatever a reader pasted into either one feed URL or a list of
 * candidates to choose between, without subscribing to anything.
 *
 * Every request here goes through `fetchFeedUrl`, so the SSRF policy, redirect
 * revalidation, and size ceiling apply to discovery exactly as they do to
 * polling. The work mirrors the web's own add-feed resolution — YouTube first,
 * then `<link rel="alternate">`, then common-path probing — with one deliberate
 * difference: a page advertising several feeds stops here instead of silently
 * taking the first, because "Posts" and "Comments" are not interchangeable and
 * only the reader knows which they meant.
 *
 * The chosen feed is fetched again by `addFeedForUser`, which needs the body to
 * parse it. That second request is the price of leaving the ingest path
 * untouched; add-a-feed is a rare, deliberate action, and the probe loop below
 * already costs more than it does.
 */
export async function discoverFeedCandidates(
  rawUrl: string,
): Promise<FeedDiscovery> {
  const inputUrl = normalizeInputUrl(rawUrl);
  let parsed: URL;
  try {
    parsed = new URL(inputUrl);
  } catch {
    return { status: "none", error: "That is not a valid web address." };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { status: "none", error: "Feeds are fetched over HTTP or HTTPS." };
  }

  // YouTube channel/playlist/user URLs resolve without fetching the page.
  const ytDirect = youtubeFeedUrl(inputUrl);
  if (ytDirect) {
    return (await respondsAsFeed(ytDirect))
      ? { status: "feed", feedUrl: ytDirect }
      : { status: "none", error: "That YouTube channel has no feed." };
  }

  const first = await fetchFeedUrl(inputUrl);
  if (first.status === "error") {
    return { status: "none", error: first.error };
  }
  if (first.status === "not-modified") {
    return { status: "none", error: "That address answered with no content." };
  }
  if (!looksLikeHtml(first.body, first.contentType)) {
    return { status: "feed", feedUrl: inputUrl };
  }

  // Handle/vanity YouTube URLs: the channel id is only in the page HTML.
  if (isYouTubeUrl(inputUrl)) {
    const ytFromPage = youtubeFeedUrl(inputUrl, first.body);
    if (ytFromPage && (await respondsAsFeed(ytFromPage))) {
      return { status: "feed", feedUrl: ytFromPage };
    }
    return {
      status: "none",
      error:
        "Could not find that channel's id — try its /channel/UC… address instead.",
    };
  }

  const alternates = discoverFeedAlternates(first.body, inputUrl);
  if (alternates.length > 1) {
    return { status: "candidates", candidates: alternates };
  }
  if (alternates.length === 1 && (await respondsAsFeed(alternates[0].url))) {
    return { status: "feed", feedUrl: alternates[0].url };
  }

  for (const path of COMMON_FEED_PATHS) {
    const probe = new URL(path, inputUrl).toString();
    if (await respondsAsFeed(probe)) return { status: "feed", feedUrl: probe };
  }
  return { status: "none", error: "No feed found at that address." };
}

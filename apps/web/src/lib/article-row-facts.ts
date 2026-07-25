import type { ReaderItem } from "@/lib/reader";

export interface ArticleRowFacts {
  /** Full text when extraction produced it, otherwise the feed-provided body. */
  contentHtml: string | null;
  /** Extraction is queued or running, so a body may still appear. */
  fullTextPending: boolean;
  /** Extraction gave up; the feed body and Open original are what remain. */
  fullTextUnavailable: boolean;
  /** Collapsed-row subtitle for a saved page, empty when there is nothing to say. */
  pageSubtitle: string;
}

/**
 * What one row needs to know about its own state, derived in one place rather
 * than as a run of conditionals inside the list render.
 *
 * The full-text states apply only to feed articles: a saved page has its own
 * extraction lifecycle in `pageStatus`, and reading `fullContentStatus` on one
 * would silently report a feed article's states for something that never had
 * them.
 */
export function articleRowFacts(item: ReaderItem): ArticleRowFacts {
  const isPage = item.kind === "page";
  return {
    contentHtml: item.fullContentHtml ?? item.contentHtml,
    fullTextPending:
      !isPage &&
      (item.fullContentStatus === "pending" ||
        item.fullContentStatus === "processing" ||
        item.fullContentStatus === "retrying"),
    fullTextUnavailable: !isPage && item.fullContentStatus === "unavailable",
    pageSubtitle: !isPage
      ? ""
      : item.pageStatus === "pending"
        ? "Fetching a readable copy…"
        : item.pageStatus === "error"
          ? "Couldn't fetch a readable copy — open the original."
          : "",
  };
}

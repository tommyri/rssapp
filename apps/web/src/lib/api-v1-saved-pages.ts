import { apiArticleSummary } from "@/lib/api-v1-article-summary";
import {
  type ApiSavedPageCursor,
  type ApiSavedPageProgress,
  encodeApiSavedPageCursor,
} from "@/lib/api-v1-input";
import { normalizeStoredArticleHtml } from "@/lib/feeds";
import { storedReadingProgress } from "@/lib/reading-progress";
import {
  extractSavedPage,
  getSavedPage,
  listSavedPagePage,
  removeSavedPage,
  retrySavedPage,
  type SavedPage,
  saveLink,
  setSavedPagesRead,
  setSavedPagesReadingProgress,
} from "@/lib/saved-pages";

/**
 * How far a readable copy has got. The stored lifecycle has three states but
 * only two of them are terminal, and the third — a retryable failure parked
 * with a backoff — is stored as `pending` precisely so a reader is not shown a
 * failure the poller intends to undo. That is the web's rule and it is repeated
 * here rather than reinterpreted: `pending` means keep waiting, `failed` means
 * this needs a decision, `ready` means read it.
 */
export type ApiSavedPageExtractionStatus = "pending" | "ready" | "failed";

export interface ApiSavedPage {
  id: string;
  url: string;
  /** The extracted title, falling back to the URL — never empty. */
  title: string;
  /**
   * What the row shows where a feed article shows its feed: the publisher name
   * from extraction, else the URL's host. Derived here so a native row and a
   * web row name the same source without the device parsing URLs.
   */
  siteName: string;
  author: string | null;
  savedAt: string;
  extraction: {
    status: ApiSavedPageExtractionStatus;
    /**
     * Why the copy could not be fetched. Non-null only for `failed`: while a
     * page is still pending, the stored text is the last transient failure and
     * showing it would report a problem that is about to fix itself.
     */
    error: string | null;
  };
  content: { html: string | null };
  /** Same row facts as an article, computed by the same functions. */
  preview: string | null;
  readingTime: number | null;
  /**
   * A saved page is in Read later by definition — there is no flag to clear,
   * which is why its only removal verb is Remove — so the state it carries is
   * the state it can actually change.
   */
  state: { read: boolean; readingProgress: number | null };
}

export interface ApiSavedPagePage {
  data: ApiSavedPage[];
  pagination: { nextCursor: string | null };
}

function hostLabel(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

/** The stored lifecycle, projected onto the three states a client can act on. */
function extractionStatus(page: SavedPage): ApiSavedPageExtractionStatus {
  if (page.status === "ready") return "ready";
  return page.status === "error" ? "failed" : "pending";
}

export function apiSavedPage(page: SavedPage): ApiSavedPage {
  const html = normalizeStoredArticleHtml(page.contentHtml, page.url);
  const title = page.title ?? page.url;
  const summary = apiArticleSummary(html, title);
  const status = extractionStatus(page);
  return {
    id: String(page.id),
    url: page.url,
    title,
    siteName: page.siteName ?? hostLabel(page.url),
    author: page.byline,
    savedAt: page.savedAt.toISOString(),
    extraction: {
      status,
      error: status === "failed" ? page.error : null,
    },
    content: { html },
    preview: summary.preview,
    readingTime: summary.readingTime,
    state: { read: page.read, readingProgress: page.readingProgress },
  };
}

export async function listApiSavedPages(
  userId: number,
  query: { limit: number; cursor: ApiSavedPageCursor | null },
): Promise<ApiSavedPagePage> {
  const page = await listSavedPagePage(userId, query.limit, query.cursor);
  return {
    data: page.pages.map(apiSavedPage),
    pagination: {
      nextCursor: page.nextCursor
        ? encodeApiSavedPageCursor(page.nextCursor)
        : null,
    },
  };
}

export type ApiSaveLinkResult =
  | {
      status: "saved";
      alreadySaved: boolean;
      /** Numeric id, for the caller's deferred extraction. */
      savedPageId: number;
      page: ApiSavedPage;
    }
  | { status: "invalid"; message: string };

/**
 * Save a URL through the web's own save path: the same canonicalization and the
 * same per-account unique row, so saving a link from a phone and from the
 * bookmark produce one entry rather than two. The caller spends the shared
 * budget first and schedules extraction afterwards — neither happens here, so
 * the ceiling cannot be enforced in one call site and forgotten in another, and
 * the deferral stays where the request lifecycle is understood.
 */
export async function createApiSavedPage(
  userId: number,
  url: string,
): Promise<ApiSaveLinkResult> {
  const result = await saveLink(userId, url);
  if (!result.ok) return { status: "invalid", message: result.error };

  const page = await getSavedPage(userId, result.id);
  if (!page) return { status: "invalid", message: "Could not save that link." };
  return {
    status: "saved",
    alreadySaved: result.alreadySaved,
    savedPageId: result.id,
    page: apiSavedPage(page),
  };
}

/**
 * Fetch the readable copy for a page that was just saved. Meant to run after
 * the response has been sent: a share sheet has to dismiss now and a publisher
 * may take fifteen seconds. Failures are swallowed because the scheduler sweep
 * is the backstop for exactly this case.
 */
export async function runApiSavedPageExtraction(id: number): Promise<void> {
  await extractSavedPage(id).catch(() => {});
}

/** True when a saved page was this account's and is now gone. */
export async function removeApiSavedPage(
  userId: number,
  id: number,
): Promise<boolean> {
  return removeSavedPage(userId, id);
}

/**
 * A deliberate retry, with the web's Retry semantics: the attempt budget and
 * any backoff are cleared first, so a page that had exhausted its automatic
 * attempts gets a genuinely fresh start rather than an immediate re-failure.
 * Null means the page is not this account's.
 */
export async function retryApiSavedPage(
  userId: number,
  id: number,
): Promise<ApiSavedPage | null> {
  const result = await retrySavedPage(userId, id);
  return result.ok ? apiSavedPage(result.page) : null;
}

export async function setApiSavedPageReadState(
  userId: number,
  savedPageIds: number[],
  read: boolean,
): Promise<number[] | null> {
  return setSavedPagesRead(userId, savedPageIds, read);
}

/**
 * Store resume positions after normalizing each with the reader's own rule, so
 * a native position and a web position mean the same thing.
 */
export async function setApiSavedPageReadingProgress(
  userId: number,
  positions: ApiSavedPageProgress[],
): Promise<ApiSavedPageProgress[] | null> {
  const normalized = positions.map((position) => ({
    savedPageId: position.savedPageId,
    readingProgress:
      position.readingProgress === null
        ? null
        : storedReadingProgress(position.readingProgress),
  }));
  const written = await setSavedPagesReadingProgress(userId, normalized);
  return written === null ? null : normalized;
}

import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { labels, savedPageLabels, savedPages } from "@/db/schema";
import { canonicalizeUrl } from "@/lib/canonical-url";
import { extractReadablePage } from "@/lib/feeds/extract";

export interface SavedPage {
  id: number;
  url: string;
  title: string | null;
  byline: string | null;
  siteName: string | null;
  excerpt: string | null;
  contentHtml: string | null;
  status: "pending" | "ready" | "error";
  error: string | null;
  read: boolean;
  readingProgress: number | null;
  savedAt: Date;
}

export type SaveLinkResult =
  | { ok: true; id: number; alreadySaved: boolean }
  | { ok: false; error: string };

/** Save a link for later. Idempotent per user+URL; returns the existing row if any. */
export async function saveLink(
  userId: number,
  rawUrl: string,
): Promise<SaveLinkResult> {
  const url = canonicalizeUrl(rawUrl);
  if (!url) return { ok: false, error: "Enter a valid web address." };

  const [inserted] = await db
    .insert(savedPages)
    .values({ userId, url, status: "pending" })
    .onConflictDoNothing({
      target: [savedPages.userId, savedPages.url],
    })
    .returning({ id: savedPages.id });

  if (inserted) return { ok: true, id: inserted.id, alreadySaved: false };

  const [existing] = await db
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(and(eq(savedPages.userId, userId), eq(savedPages.url, url)));
  if (!existing) return { ok: false, error: "Could not save that link." };
  return { ok: true, id: existing.id, alreadySaved: true };
}

/**
 * Fetch and store a readable copy of a saved page. Best-effort and idempotent:
 * flips status to 'ready' with content, or 'error' with a message. Safe to call
 * from the save action (for immediacy) and the scheduler (as a backstop).
 */
export async function extractSavedPage(id: number): Promise<void> {
  const [page] = await db
    .select({ id: savedPages.id, url: savedPages.url })
    .from(savedPages)
    .where(eq(savedPages.id, id));
  if (!page) return;

  const result = await extractReadablePage(page.url);
  if (result.status === "error") {
    await db
      .update(savedPages)
      .set({ status: "error", error: result.error })
      .where(eq(savedPages.id, id));
    return;
  }

  await db
    .update(savedPages)
    .set({
      status: "ready",
      error: null,
      contentHtml: result.html,
      title: result.title,
      byline: result.byline,
      siteName: result.siteName,
      excerpt: result.excerpt,
    })
    .where(eq(savedPages.id, id));
}

const SWEEP_BATCH = 10;

/**
 * Extract any saved pages still awaiting a readable copy. Called each scheduler
 * tick as the reliable backstop for links saved via the bookmarklet (which
 * doesn't wait). Returns how many were processed.
 */
export async function sweepPendingSavedPages(): Promise<number> {
  const pending = await db
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(eq(savedPages.status, "pending"))
    .orderBy(savedPages.savedAt)
    .limit(SWEEP_BATCH);

  for (const p of pending) {
    await extractSavedPage(p.id);
  }
  return pending.length;
}

const columns = {
  id: savedPages.id,
  url: savedPages.url,
  title: savedPages.title,
  byline: savedPages.byline,
  siteName: savedPages.siteName,
  excerpt: savedPages.excerpt,
  contentHtml: savedPages.contentHtml,
  status: sql<"pending" | "ready" | "error">`${savedPages.status}`,
  error: savedPages.error,
  read: savedPages.read,
  readingProgress: savedPages.readingProgress,
  savedAt: savedPages.savedAt,
};

const LIST_LIMIT = 500;

/** All of a user's saved pages, newest first (for the unified Read later view). */
export async function listSavedPages(
  userId: number,
  labelId?: number,
): Promise<SavedPage[]> {
  const query = db.select(columns).from(savedPages).$dynamic();
  if (labelId !== undefined) {
    return query
      .innerJoin(
        savedPageLabels,
        eq(savedPageLabels.savedPageId, savedPages.id),
      )
      .innerJoin(labels, eq(labels.id, savedPageLabels.labelId))
      .where(
        and(
          eq(savedPages.userId, userId),
          eq(labels.userId, userId),
          eq(labels.id, labelId),
        ),
      )
      .orderBy(desc(savedPages.savedAt), desc(savedPages.id))
      .limit(LIST_LIMIT);
  }
  return query
    .where(eq(savedPages.userId, userId))
    .orderBy(desc(savedPages.savedAt), desc(savedPages.id))
    .limit(LIST_LIMIT);
}

/** Full-text search over a user's saved pages; recency as tiebreak. */
export async function searchSavedPages(
  userId: number,
  query: string,
): Promise<SavedPage[]> {
  const tsquery = sql`(websearch_to_tsquery('english', ${query}) || websearch_to_tsquery('norwegian', ${query}))`;
  return db
    .select(columns)
    .from(savedPages)
    .where(
      and(
        eq(savedPages.userId, userId),
        sql`${savedPages.searchVector} @@ ${tsquery}`,
      ),
    )
    .orderBy(
      sql`ts_rank(${savedPages.searchVector}, ${tsquery}) desc`,
      desc(savedPages.savedAt),
    )
    .limit(50);
}

/** Count of a user's saved pages, for the Read later sidebar total. */
export async function savedPagesCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ n: sql<number>`cast(count(*) as int)` })
    .from(savedPages)
    .where(eq(savedPages.userId, userId));
  return row?.n ?? 0;
}

/** Set read state for one saved page (user-scoped). */
export async function setSavedPageRead(
  userId: number,
  id: number,
  read: boolean,
): Promise<void> {
  await db
    .update(savedPages)
    .set({ read, readAt: read ? new Date() : null })
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)));
}

/** Store a resumable saved-page position (the row is already user-scoped). */
export async function setSavedPageReadingProgress(
  userId: number,
  id: number,
  readingProgress: number | null,
): Promise<void> {
  await db
    .update(savedPages)
    .set({ readingProgress, readingProgressUpdatedAt: new Date() })
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)));
}

/** Delete one saved page (user-scoped). */
export async function removeSavedPage(
  userId: number,
  id: number,
): Promise<void> {
  await db
    .delete(savedPages)
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)));
}

export type RetryResult =
  | { ok: true; page: SavedPage }
  | { ok: false; error: string };

/** Re-run extraction for one saved page (user-scoped); returns the fresh row. */
export async function retrySavedPage(
  userId: number,
  id: number,
): Promise<RetryResult> {
  const [owned] = await db
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)));
  if (!owned) return { ok: false, error: "Saved page not found." };

  await extractSavedPage(id);
  const [page] = await db
    .select(columns)
    .from(savedPages)
    .where(eq(savedPages.id, id));
  return page ? { ok: true, page } : { ok: false, error: "Extraction failed." };
}

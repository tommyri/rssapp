import { and, desc, eq, inArray, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { labels, savedPageLabels, savedPages } from "@/db/schema";
import { canonicalizeUrl } from "@/lib/canonical-url";
import { extractReadablePage, type ReadablePage } from "@/lib/feeds/extract";
import {
  nextSavedPageRetryAt,
  SAVED_PAGE_EXTRACTION_LOCK_MS,
} from "@/lib/saved-page-retry";

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

interface ClaimedSavedPage {
  id: number;
  url: string;
  /** Attempts including this one — the claim increments before extracting. */
  attempts: number;
  claimedAt: Date;
}

const claimFields = {
  id: savedPages.id,
  url: savedPages.url,
  attempts: savedPages.extractionAttempts,
};

/** Pending, due, and not already owned by a live worker. */
function claimable(now: Date) {
  const staleBefore = new Date(now.getTime() - SAVED_PAGE_EXTRACTION_LOCK_MS);
  return and(
    eq(savedPages.status, "pending"),
    or(
      isNull(savedPages.extractionNextAt),
      lte(savedPages.extractionNextAt, now),
    ),
    or(
      isNull(savedPages.extractionStartedAt),
      lte(savedPages.extractionStartedAt, staleBefore),
    ),
  );
}

/**
 * Only the worker still holding the claim may publish a result. Without this a
 * slow worker whose lock has already been reclaimed could overwrite the newer
 * worker's outcome — including burying a readable copy under a stale failure.
 */
function heldClaim(page: ClaimedSavedPage) {
  return and(
    eq(savedPages.id, page.id),
    eq(savedPages.extractionStartedAt, page.claimedAt),
  );
}

/** Take one row if it is available; null means another worker owns it. */
async function claimSavedPage(
  id: number,
  now = new Date(),
): Promise<ClaimedSavedPage | null> {
  const [claimed] = await db
    .update(savedPages)
    .set({
      extractionStartedAt: now,
      extractionAttempts: sql`${savedPages.extractionAttempts} + 1`,
    })
    .where(and(eq(savedPages.id, id), claimable(now)))
    .returning(claimFields);
  return claimed ? { ...claimed, claimedAt: now } : null;
}

/**
 * Reserve a batch of due extractions. SKIP LOCKED keeps two app processes — or
 * a sweep racing the save path — from fetching the same publisher URL twice.
 */
async function claimDueSavedPages(
  limit: number,
  now = new Date(),
): Promise<ClaimedSavedPage[]> {
  return db.transaction(async (tx) => {
    const due = await tx
      .select({ id: savedPages.id })
      .from(savedPages)
      .where(claimable(now))
      .orderBy(savedPages.savedAt)
      .limit(limit)
      .for("update", { skipLocked: true });
    if (due.length === 0) return [];

    const claimed = await tx
      .update(savedPages)
      .set({
        extractionStartedAt: now,
        extractionAttempts: sql`${savedPages.extractionAttempts} + 1`,
      })
      .where(
        inArray(
          savedPages.id,
          due.map((row) => row.id),
        ),
      )
      .returning(claimFields);
    return claimed.map((row) => ({ ...row, claimedAt: now }));
  });
}

async function publishReady(
  page: ClaimedSavedPage,
  result: Extract<ReadablePage, { status: "ok" }>,
): Promise<void> {
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
      extractionStartedAt: null,
      extractionNextAt: null,
    })
    .where(heldClaim(page));
}

async function publishFailure(
  page: ClaimedSavedPage,
  error: string,
  retryable: boolean | undefined,
  retryAfterAt: Date | undefined,
): Promise<"retrying" | "error"> {
  const nextAt = retryable
    ? nextSavedPageRetryAt(page.attempts, new Date(), retryAfterAt)
    : null;
  await db
    .update(savedPages)
    .set({
      // A retryable failure stays pending: the reader is still owed a copy, and
      // a visible failure we intend to undo in a minute is just noise. Only an
      // exhausted or permanent failure becomes terminal.
      status: nextAt === null ? "error" : "pending",
      error: error.slice(0, 1_000),
      extractionStartedAt: null,
      extractionNextAt: nextAt,
    })
    .where(heldClaim(page));
  return nextAt === null ? "error" : "retrying";
}

async function runExtraction(
  page: ClaimedSavedPage,
): Promise<"ready" | "retrying" | "error"> {
  try {
    const result = await extractReadablePage(page.url);
    if (result.status === "ok") {
      await publishReady(page, result);
      return "ready";
    }
    return publishFailure(
      page,
      result.error,
      result.retryable,
      result.retryAfterAt,
    );
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // An unexpected throw is treated as transient; the attempt budget bounds it.
    return publishFailure(page, message, true, undefined);
  }
}

/**
 * Fetch and store a readable copy of one saved page. Claims the row first, so
 * this is safe to call from the save path for immediacy while the scheduler
 * sweep runs as the backstop — whichever gets there first does the work once.
 */
export async function extractSavedPage(id: number): Promise<void> {
  const claimed = await claimSavedPage(id);
  if (!claimed) return;
  await runExtraction(claimed);
}

const SWEEP_BATCH = 10;

export interface SavedPageSweepSummary {
  claimed: number;
  extracted: number;
  retrying: number;
  failed: number;
}

/**
 * Extract any saved pages still awaiting a readable copy. Called each scheduler
 * tick as the reliable backstop for links saved via the bookmark (which doesn't
 * wait) and as the retry path for pages whose publisher failed transiently.
 */
export async function sweepPendingSavedPages(): Promise<SavedPageSweepSummary> {
  const claimed = await claimDueSavedPages(SWEEP_BATCH);
  const summary: SavedPageSweepSummary = {
    claimed: claimed.length,
    extracted: 0,
    retrying: 0,
    failed: 0,
  };

  for (const page of claimed) {
    const outcome = await runExtraction(page);
    if (outcome === "ready") summary.extracted += 1;
    else if (outcome === "retrying") summary.retrying += 1;
    else summary.failed += 1;
  }
  return summary;
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

/** One saved page for a user-scoped reader route. */
export async function getSavedPage(
  userId: number,
  id: number,
): Promise<SavedPage | null> {
  const [page] = await db
    .select(columns)
    .from(savedPages)
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)));
  return page ?? null;
}

/** Full-text search over a user's saved pages; recency as tiebreak. */
export async function searchSavedPages(
  userId: number,
  query: string,
): Promise<SavedPage[]> {
  const tsquery = sql`(websearch_to_tsquery('english', ${query}) || websearch_to_tsquery('norwegian', ${query}) || websearch_to_tsquery('simple', ${query}))`;
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

/**
 * Delete one saved page (user-scoped). True when a row was actually this
 * account's and went away, so a caller that has to answer "did that exist?" —
 * an API DELETE, say — does not need a second lookup to find out.
 */
export async function removeSavedPage(
  userId: number,
  id: number,
): Promise<boolean> {
  const deleted = await db
    .delete(savedPages)
    .where(and(eq(savedPages.id, id), eq(savedPages.userId, userId)))
    .returning({ id: savedPages.id });
  return deleted.length > 0;
}

export interface SavedPageCursor {
  savedAt: Date;
  savedPageId: number;
}

export interface SavedPagePage {
  pages: SavedPage[];
  /** The last row of a full page, so the caller can mint a continuation. */
  nextCursor: SavedPageCursor | null;
}

/**
 * One keyset page of a user's saved pages, newest-saved-first.
 *
 * The web loads the whole list and merges it with flagged articles in memory
 * (`listReadLater`), which a phone cannot do. `(saved_at, id)` is the same order
 * the web sorts by and is covered by `saved_pages_user_saved_idx`, so a cursor
 * over it stays a range scan rather than an offset walk.
 */
export async function listSavedPagePage(
  userId: number,
  limit: number,
  cursor: SavedPageCursor | null,
): Promise<SavedPagePage> {
  const conditions = [eq(savedPages.userId, userId)];
  if (cursor) {
    conditions.push(
      sql`(${savedPages.savedAt}, ${savedPages.id}) < (${cursor.savedAt}, ${cursor.savedPageId})`,
    );
  }

  const rows = await db
    .select(columns)
    .from(savedPages)
    .where(and(...conditions))
    .orderBy(desc(savedPages.savedAt), desc(savedPages.id))
    .limit(limit + 1);

  const visible = rows.slice(0, limit);
  const last = visible.at(-1);
  return {
    pages: visible,
    nextCursor:
      rows.length > limit && last
        ? { savedAt: last.savedAt, savedPageId: last.id }
        : null,
  };
}

type SavedPageTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

/**
 * True only when every id is one of this account's saved pages. Run inside the
 * writing transaction, the same way article batches are validated, so a batch
 * naming someone else's page cannot half-apply.
 */
async function ownsEverySavedPage(
  tx: SavedPageTransaction,
  userId: number,
  distinctIds: number[],
): Promise<boolean> {
  const owned = await tx
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(
      and(eq(savedPages.userId, userId), inArray(savedPages.id, distinctIds)),
    );
  return owned.length === distinctIds.length;
}

/**
 * Batched read state for saved pages, validated as one owned batch. Null means
 * at least one id was not this account's and nothing was written.
 */
export async function setSavedPagesRead(
  userId: number,
  ids: number[],
  read: boolean,
): Promise<number[] | null> {
  const distinctIds = [...new Set(ids)];
  return db.transaction(async (tx) => {
    if (!(await ownsEverySavedPage(tx, userId, distinctIds))) return null;
    await tx
      .update(savedPages)
      .set({ read, readAt: read ? new Date() : null })
      // The account is named again even though the check above already proved
      // ownership: the write is then safe on its own terms, not only because a
      // preceding query in the same transaction happened to be right.
      .where(
        and(eq(savedPages.userId, userId), inArray(savedPages.id, distinctIds)),
      );
    return distinctIds;
  });
}

export interface SavedPageProgress {
  savedPageId: number;
  readingProgress: number | null;
}

/**
 * Batched resume positions for saved pages, validated as one owned batch.
 * Positions are already normalized by the caller; this only stores them, and
 * the ids must already be distinct — the ownership count below compares against
 * `positions.length`, so a repeated id would fail the batch rather than pass it.
 *
 * A statement per position, because each carries a different value. Bounded at
 * a hundred and, in practice, one: a reader finishes one thing at a time and a
 * client only ever batches what it buffered while offline.
 */
export async function setSavedPagesReadingProgress(
  userId: number,
  positions: SavedPageProgress[],
): Promise<SavedPageProgress[] | null> {
  const ids = positions.map((position) => position.savedPageId);
  return db.transaction(async (tx) => {
    if (!(await ownsEverySavedPage(tx, userId, ids))) return null;
    const now = new Date();
    for (const position of positions) {
      await tx
        .update(savedPages)
        .set({
          readingProgress: position.readingProgress,
          readingProgressUpdatedAt: now,
        })
        .where(
          and(
            eq(savedPages.userId, userId),
            eq(savedPages.id, position.savedPageId),
          ),
        );
    }
    return positions;
  });
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

  // Publish the retry before doing the work. A reader watching this page polls
  // the stored status, so leaving the previous failure in place would report
  // that stale error back as a terminal result while the fetch is still running.
  // An explicit retry is a fresh start, so it also clears the attempt budget and
  // any backoff a previous automatic attempt left behind.
  await db
    .update(savedPages)
    .set({
      status: "pending",
      error: null,
      extractionAttempts: 0,
      extractionStartedAt: null,
      extractionNextAt: null,
    })
    .where(eq(savedPages.id, id));

  // If the sweep claimed this row in between, it is already doing the work; the
  // row stays pending here and the reader's watcher picks up that result.
  await extractSavedPage(id);
  const [page] = await db
    .select(columns)
    .from(savedPages)
    .where(eq(savedPages.id, id));
  return page ? { ok: true, page } : { ok: false, error: "Extraction failed." };
}

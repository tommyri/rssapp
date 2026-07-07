import {
  and,
  asc,
  count,
  eq,
  exists,
  gt,
  isNotNull,
  isNull,
  lte,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  fetchLog,
  items as itemsTable,
  subscriptions,
} from "@/db/schema";
import { canonicalizeUrl } from "@/lib/canonical-url";
import { applyRulesToNewItems } from "@/lib/rules";
import {
  COMMON_FEED_PATHS,
  discoverFeedLinks,
  isYouTubeUrl,
  looksLikeHtml,
  youtubeFeedUrl,
} from "./discover";
import { type FetchResult, fetchUrl } from "./fetch";
import { autoExtractForFeed } from "./full-content";
import { parseFeed } from "./parse";
import type { ParsedItem } from "./types";

type OkResult = Extract<FetchResult, { status: "ok" }>;

const DEFAULT_INTERVAL_MIN = 15;
const MAX_BACKOFF_MIN = 6 * 60;
// A feed's first successful fetch only backfills this many of its most recent
// posts, so importing a feed with a long archive doesn't store hundreds of
// entries at once. Later fetches ingest everything new (see upsertItems).
const INITIAL_BACKFILL_ITEMS = 25;

function minutesFromNow(minutes: number): Date {
  return new Date(Date.now() + minutes * 60_000);
}

function backoffMinutes(failures: number, interval: number): number {
  return Math.min(interval * 2 ** failures, MAX_BACKOFF_MIN);
}

function normalizeInputUrl(raw: string): string {
  const trimmed = raw.trim();
  if (!/^https?:\/\//i.test(trimmed)) return `https://${trimmed}`;
  return trimmed;
}

/**
 * Insert new items, skipping any already stored for this feed, then run the
 * subscribers' rules over whatever was actually new. Returns the count added.
 *
 * A feed's very first fetch only backfills INITIAL_BACKFILL_ITEMS posts so
 * importing a feed with a long archive doesn't store hundreds of entries at
 * once: dated posts are taken newest-first, then undated posts in feed order
 * fill any remaining slots. Once the feed has stored items, later fetches
 * ingest every new post so high-volume feeds never skip anything.
 */
async function upsertItems(
  feedId: number,
  parsedItems: ParsedItem[],
): Promise<number> {
  // Collapse any in-feed duplicate guids before hitting the unique index.
  const byGuid = new Map<string, ParsedItem>();
  for (const item of parsedItems) byGuid.set(item.guid, item);
  if (byGuid.size === 0) return 0;

  let candidates = [...byGuid.values()];

  // On the first fetch (no stored items yet) keep only INITIAL_BACKFILL_ITEMS;
  // afterwards ingest everything new so busy feeds never lose posts.
  const [{ value: storedCount }] = await db
    .select({ value: count() })
    .from(itemsTable)
    .where(eq(itemsTable.feedId, feedId));
  if (storedCount === 0) {
    // Prefer posts that carry a publish date, newest first; then fall back to
    // undated posts in feed order to fill any remaining slots up to the cap.
    const dated = candidates
      .filter((item) => item.publishedAt !== null)
      .sort(
        (a, b) =>
          (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0),
      );
    const undated = candidates.filter((item) => item.publishedAt === null);
    candidates = [...dated, ...undated].slice(0, INITIAL_BACKFILL_ITEMS);
  }

  const rows = candidates.map((item) => ({
    feedId,
    guid: item.guid,
    url: item.url,
    canonicalUrl: item.url ? canonicalizeUrl(item.url) : null,
    title: item.title,
    author: item.author,
    contentHtml: item.contentHtml,
    publishedAt: item.publishedAt,
  }));

  const inserted = await db
    .insert(itemsTable)
    .values(rows)
    .onConflictDoNothing({ target: [itemsTable.feedId, itemsTable.guid] })
    .returning({
      id: itemsTable.id,
      title: itemsTable.title,
      author: itemsTable.author,
      contentHtml: itemsTable.contentHtml,
      url: itemsTable.url,
    });

  await applyRulesToNewItems(feedId, inserted);
  await autoExtractForFeed(feedId, inserted);

  return inserted.length;
}

/**
 * One-time backfill: populate items.canonical_url for rows ingested before the
 * column existed, reusing the same canonicalizeUrl used at ingest so old and new
 * items dedup by an identical key. Walks by id cursor so rows that canonicalize
 * to null (non-http/malformed urls) are stepped over rather than re-selected
 * forever. Idempotent and cheap once complete — after the first pass almost
 * every row has a value — so instrumentation runs it at boot after migrations.
 */
export async function backfillCanonicalUrls(): Promise<number> {
  const BATCH = 1000;
  let lastId = 0;
  let filled = 0;
  for (;;) {
    const rows = await db
      .select({ id: itemsTable.id, url: itemsTable.url })
      .from(itemsTable)
      .where(
        and(
          isNotNull(itemsTable.url),
          isNull(itemsTable.canonicalUrl),
          gt(itemsTable.id, lastId),
        ),
      )
      .orderBy(asc(itemsTable.id))
      .limit(BATCH);
    if (rows.length === 0) break;

    for (const row of rows) {
      const canonical = row.url ? canonicalizeUrl(row.url) : null;
      if (canonical) {
        await db
          .update(itemsTable)
          .set({ canonicalUrl: canonical })
          .where(eq(itemsTable.id, row.id));
        filled += 1;
      }
    }
    lastId = rows[rows.length - 1].id;
    if (rows.length < BATCH) break;
  }
  return filled;
}

/** Fetch a candidate feed URL and return it if it responds with feed content. */
async function tryFeedUrl(
  candidate: string,
): Promise<{ feedUrl: string; ok: OkResult } | null> {
  const res = await fetchUrl(candidate);
  if (res.status === "ok" && !looksLikeHtml(res.body, res.contentType)) {
    return { feedUrl: candidate, ok: res };
  }
  return null;
}

/**
 * Turn whatever URL the user pasted into a fetched feed body: YouTube URLs
 * map to their native feeds; HTML pages get <link> autodiscovery, then
 * common-path probing as a fallback.
 */
async function resolveFeed(
  inputUrl: string,
): Promise<{ feedUrl: string; ok: OkResult }> {
  // YouTube channel/playlist/user URLs resolve without fetching the page.
  const ytDirect = youtubeFeedUrl(inputUrl);
  if (ytDirect) {
    const hit = await tryFeedUrl(ytDirect);
    if (hit) return hit;
    throw new Error(`YouTube feed not found for ${inputUrl}`);
  }

  const first = await fetchUrl(inputUrl);
  if (first.status === "error") {
    throw new Error(`Could not fetch ${inputUrl}: ${first.error}`);
  }
  if (first.status === "not-modified") {
    throw new Error(`Unexpected 304 from ${inputUrl}`);
  }
  if (!looksLikeHtml(first.body, first.contentType)) {
    return { feedUrl: inputUrl, ok: first };
  }

  // Handle/vanity YouTube URLs: the channel id is only in the page HTML.
  if (isYouTubeUrl(inputUrl)) {
    const ytFromPage = youtubeFeedUrl(inputUrl, first.body);
    if (ytFromPage) {
      const hit = await tryFeedUrl(ytFromPage);
      if (hit) return hit;
    }
    throw new Error(
      `Could not find the channel id for ${inputUrl} — try the channel's /channel/UC… URL.`,
    );
  }

  const discovered = discoverFeedLinks(first.body, inputUrl);
  const probes = COMMON_FEED_PATHS.map((p) => new URL(p, inputUrl).toString());
  for (const candidate of [...discovered, ...probes]) {
    const hit = await tryFeedUrl(candidate);
    if (hit) return hit;
  }
  throw new Error(`No feed found at ${inputUrl}`);
}

/**
 * Ensure a feed row exists for this URL without fetching it. Used by OPML import
 * to create subscriptions fast; new feeds default to due (next_fetch_at = now),
 * so the scheduler fetches their content on the next tick.
 */
export async function ensureFeed(
  rawUrl: string,
  fallbackTitle: string | null,
): Promise<number> {
  const url = normalizeInputUrl(rawUrl);
  const [inserted] = await db
    .insert(feeds)
    .values({ url, title: fallbackTitle })
    .onConflictDoNothing({ target: feeds.url })
    .returning({ id: feeds.id });
  if (inserted) return inserted.id;

  const [existing] = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(eq(feeds.url, url));
  return existing.id;
}

export interface AddFeedResult {
  feedId: number;
  title: string;
  itemsAdded: number;
}

/** Add (or reuse) a feed, ingest its items, and subscribe the user. */
export async function addFeedForUser(
  userId: number,
  rawUrl: string,
): Promise<AddFeedResult> {
  const inputUrl = normalizeInputUrl(rawUrl);
  const { feedUrl, ok } = await resolveFeed(inputUrl);
  const parsed = await parseFeed(ok.body, ok.contentType);
  const now = new Date();

  const [feed] = await db
    .insert(feeds)
    .values({
      url: feedUrl,
      title: parsed.title,
      siteUrl: parsed.siteUrl,
      description: parsed.description,
      etag: ok.etag,
      lastModified: ok.lastModified,
      lastFetchedAt: now,
      nextFetchAt: minutesFromNow(DEFAULT_INTERVAL_MIN),
    })
    .onConflictDoUpdate({
      target: feeds.url,
      set: {
        title: parsed.title,
        siteUrl: parsed.siteUrl,
        description: parsed.description,
        etag: ok.etag,
        lastModified: ok.lastModified,
        lastFetchedAt: now,
        nextFetchAt: minutesFromNow(DEFAULT_INTERVAL_MIN),
        consecutiveFailures: 0,
        lastError: null,
      },
    })
    .returning();

  const itemsAdded = await upsertItems(feed.id, parsed.items);

  await db
    .insert(subscriptions)
    .values({ userId, feedId: feed.id })
    .onConflictDoNothing({
      target: [subscriptions.userId, subscriptions.feedId],
    });

  await db
    .insert(fetchLog)
    .values({ feedId: feed.id, httpStatus: 200, itemsAdded });

  return { feedId: feed.id, title: feed.title ?? feedUrl, itemsAdded };
}

export interface RefreshResult {
  itemsAdded: number;
  status: "ok" | "not-modified" | "error";
  error?: string;
}

/** Re-fetch one feed using conditional GET; update state and log the outcome. */
export async function refreshFeed(feedId: number): Promise<RefreshResult> {
  const feed = await db.query.feeds.findFirst({ where: eq(feeds.id, feedId) });
  if (!feed) return { itemsAdded: 0, status: "error", error: "Feed not found" };

  const started = Date.now();
  const res = await fetchUrl(feed.url, {
    etag: feed.etag,
    lastModified: feed.lastModified,
  });
  const durationMs = Date.now() - started;
  const now = new Date();
  const interval = feed.fetchIntervalMinutes;

  if (res.status === "not-modified") {
    await db
      .update(feeds)
      .set({
        lastFetchedAt: now,
        nextFetchAt: minutesFromNow(interval),
        consecutiveFailures: 0,
        lastError: null,
      })
      .where(eq(feeds.id, feedId));
    await db
      .insert(fetchLog)
      .values({ feedId, httpStatus: 304, itemsAdded: 0, durationMs });
    return { itemsAdded: 0, status: "not-modified" };
  }

  if (res.status === "error") {
    const failures = feed.consecutiveFailures + 1;
    await db
      .update(feeds)
      .set({
        lastFetchedAt: now,
        nextFetchAt: minutesFromNow(backoffMinutes(failures, interval)),
        consecutiveFailures: failures,
        lastError: res.error,
      })
      .where(eq(feeds.id, feedId));
    await db.insert(fetchLog).values({
      feedId,
      httpStatus: res.httpStatus,
      itemsAdded: 0,
      durationMs,
      error: res.error,
    });
    return { itemsAdded: 0, status: "error", error: res.error };
  }

  let itemsAdded = 0;
  try {
    const parsed = await parseFeed(res.body, res.contentType);
    itemsAdded = await upsertItems(feedId, parsed.items);
    await db
      .update(feeds)
      .set({
        title: parsed.title ?? feed.title,
        siteUrl: parsed.siteUrl ?? feed.siteUrl,
        etag: res.etag,
        lastModified: res.lastModified,
        lastFetchedAt: now,
        nextFetchAt: minutesFromNow(interval),
        consecutiveFailures: 0,
        lastError: null,
      })
      .where(eq(feeds.id, feedId));
    await db
      .insert(fetchLog)
      .values({ feedId, httpStatus: 200, itemsAdded, durationMs });
    return { itemsAdded, status: "ok" };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    const failures = feed.consecutiveFailures + 1;
    await db
      .update(feeds)
      .set({
        lastFetchedAt: now,
        nextFetchAt: minutesFromNow(backoffMinutes(failures, interval)),
        consecutiveFailures: failures,
        lastError: `Parse failed: ${error}`,
      })
      .where(eq(feeds.id, feedId));
    await db.insert(fetchLog).values({
      feedId,
      httpStatus: 200,
      itemsAdded: 0,
      durationMs,
      error: `Parse failed: ${error}`,
    });
    return { itemsAdded: 0, status: "error", error };
  }
}

// Feed-health pause (subscriptions.settings.paused): a paused subscription
// doesn't want its feed fetched. Shared by the scheduler's due-query and the
// manual refresh-all so the two can't disagree.
const subscriptionNotPaused = sql`coalesce((${subscriptions.settings}->>'paused')::boolean, false) = false`;

/** Refresh every feed the user subscribes to. Sequential for now (few feeds). */
export async function refreshAllForSubscriber(
  userId: number,
): Promise<{ feeds: number; itemsAdded: number }> {
  const subs = await db
    .select({ feedId: subscriptions.feedId })
    .from(subscriptions)
    .where(and(eq(subscriptions.userId, userId), subscriptionNotPaused));

  let itemsAdded = 0;
  for (const { feedId } of subs) {
    const result = await refreshFeed(feedId);
    itemsAdded += result.itemsAdded;
  }
  return { feeds: subs.length, itemsAdded };
}

/** Run an async worker over items with a fixed max concurrency. */
async function runPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let index = 0;
  const runners = Array.from(
    { length: Math.min(concurrency, items.length) },
    async () => {
      while (index < items.length) {
        const item = items[index++];
        await worker(item);
      }
    },
  );
  await Promise.all(runners);
}

export interface RefreshDueOptions {
  /** Max feeds to process this pass. */
  limit?: number;
  /** Max feeds fetched at once. */
  concurrency?: number;
}

export interface RefreshDueSummary {
  due: number;
  itemsAdded: number;
  errors: number;
}

/**
 * Refresh feeds whose next_fetch_at has passed — the poll queue is the
 * feeds.next_fetch_at column plus this query (docs/tech-stack.md). refreshFeed
 * advances next_fetch_at, so a feed processed here won't be picked up again
 * until its interval elapses. refreshFeed swallows its own errors, so one bad
 * feed never breaks the pass.
 */
export async function refreshDueFeeds(
  opts: RefreshDueOptions = {},
): Promise<RefreshDueSummary> {
  const { limit = 50, concurrency = 4 } = opts;
  // Only poll feeds someone actively wants: subscribed and not paused. A feed
  // every subscriber has paused just sits with its next_fetch_at in the past
  // until someone resumes it (resuming also marks it due — subscriptions.ts).
  const due = await db
    .select({ id: feeds.id })
    .from(feeds)
    .where(
      and(
        lte(feeds.nextFetchAt, new Date()),
        exists(
          db
            .select({ one: sql`1` })
            .from(subscriptions)
            .where(
              and(eq(subscriptions.feedId, feeds.id), subscriptionNotPaused),
            ),
        ),
      ),
    )
    .orderBy(asc(feeds.nextFetchAt))
    .limit(limit);

  let itemsAdded = 0;
  let errors = 0;
  await runPool(due, concurrency, async ({ id }) => {
    const result = await refreshFeed(id);
    itemsAdded += result.itemsAdded;
    if (result.status === "error") errors += 1;
  });

  return { due: due.length, itemsAdded, errors };
}

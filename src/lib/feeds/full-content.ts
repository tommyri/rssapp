import {
  and,
  asc,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lte,
  ne,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import { itemStates, items, subscriptions } from "@/db/schema";
import { extractFullContent } from "./extract";
import {
  FULL_CONTENT_LOCK_MS,
  nextFullContentRetryAt,
} from "./full-content-policy";

const DEFAULT_BATCH_SIZE = 12;
const DEFAULT_CONCURRENCY = 3;

// Item rows are shared across readers, so any reader actively keeping an
// article (Read later, starred, or simply unread) promotes the common copy.
const extractionPriority = sql<number>`case
  when exists (
    select 1 from ${itemStates} state
    where state.item_id = ${items.id} and state.read_later is true
  ) then 0
  when exists (
    select 1 from ${itemStates} state
    where state.item_id = ${items.id} and state.starred is true
  ) then 1
  when not exists (
    select 1 from ${itemStates} state
    where state.item_id = ${items.id} and state.read is true
  ) then 2
  else 3
end`;

type ClaimedItem = {
  id: number;
  url: string;
  canonicalUrl: string | null;
  attempts: number;
};

export interface FullContentSweepSummary {
  claimed: number;
  extracted: number;
  reused: number;
  retried: number;
  unavailable: number;
}

function emptySummary(): FullContentSweepSummary {
  return { claimed: 0, extracted: 0, reused: 0, retried: 0, unavailable: 0 };
}

function hostnameFor(url: string, fallbackId: number): string {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    // Invalid URLs are marked unavailable by the guarded fetcher; do not let
    // them serialize unrelated jobs while they wait for that outcome.
    return `item-${fallbackId}`;
  }
}

/**
 * Atomically reserve due extraction jobs. SKIP LOCKED lets multiple app
 * processes run the scheduler without duplicating a fetch for the same item.
 */
async function claimDueFullContent(limit: number): Promise<ClaimedItem[]> {
  const now = new Date();
  const staleBefore = new Date(now.getTime() - FULL_CONTENT_LOCK_MS);

  return db.transaction(async (tx) => {
    const due = await tx
      .select({
        id: items.id,
        url: items.url,
        canonicalUrl: items.canonicalUrl,
        attempts: items.fullContentAttempts,
      })
      .from(items)
      .where(
        and(
          isNotNull(items.url),
          or(
            and(
              inArray(items.fullContentStatus, ["pending", "retrying"]),
              lte(items.fullContentNextAt, now),
            ),
            and(
              eq(items.fullContentStatus, "processing"),
              or(
                isNull(items.fullContentLockedAt),
                lte(items.fullContentLockedAt, staleBefore),
              ),
            ),
          ),
        ),
      )
      .orderBy(asc(extractionPriority), desc(items.createdAt), desc(items.id))
      .limit(limit)
      .for("update", { skipLocked: true });

    if (due.length === 0) return [];

    await tx
      .update(items)
      .set({
        fullContentStatus: "processing",
        fullContentLockedAt: now,
        fullContentLastError: null,
        fullContentAttempts: sql`${items.fullContentAttempts} + 1`,
      })
      .where(
        inArray(
          items.id,
          due.map((item) => item.id),
        ),
      );

    return due.flatMap((item) =>
      item.url
        ? [
            {
              id: item.id,
              url: item.url,
              canonicalUrl: item.canonicalUrl,
              attempts: item.attempts + 1,
            },
          ]
        : [],
    );
  });
}

async function cachedContentFor(item: ClaimedItem): Promise<string | null> {
  if (!item.canonicalUrl) return null;
  const [cached] = await db
    .select({ html: items.fullContentHtml })
    .from(items)
    .where(
      and(
        eq(items.canonicalUrl, item.canonicalUrl),
        eq(items.fullContentStatus, "ready"),
        isNotNull(items.fullContentHtml),
        ne(items.id, item.id),
      ),
    )
    .limit(1);
  return cached?.html ?? null;
}

async function markReady(itemId: number, html: string): Promise<void> {
  const now = new Date();
  await db
    .update(items)
    .set({
      fullContentHtml: html,
      fullContentStatus: "ready",
      fullContentNextAt: now,
      fullContentLockedAt: null,
      fullContentLastError: null,
      fullContentExtractedAt: now,
    })
    .where(
      and(eq(items.id, itemId), eq(items.fullContentStatus, "processing")),
    );
}

async function markFailure(
  item: ClaimedItem,
  error: string,
  retryable: boolean | undefined,
  retryAfterAt: Date | undefined,
): Promise<"retried" | "unavailable"> {
  const nextAt = retryable
    ? nextFullContentRetryAt(item.attempts, new Date(), retryAfterAt)
    : null;
  const terminal = nextAt === null;
  await db
    .update(items)
    .set({
      fullContentStatus: terminal ? "unavailable" : "retrying",
      fullContentNextAt: nextAt ?? new Date(),
      fullContentLockedAt: null,
      fullContentLastError: error.slice(0, 1_000),
    })
    .where(
      and(eq(items.id, item.id), eq(items.fullContentStatus, "processing")),
    );
  return terminal ? "unavailable" : "retried";
}

async function processClaimedItem(
  item: ClaimedItem,
): Promise<"extracted" | "reused" | "retried" | "unavailable"> {
  const cached = await cachedContentFor(item);
  if (cached) {
    await markReady(item.id, cached);
    return "reused";
  }

  try {
    const result = await extractFullContent(item.url);
    if (result.status === "ok") {
      await markReady(item.id, result.html);
      return "extracted";
    }
    return markFailure(
      item,
      result.error,
      result.retryable,
      result.retryAfterAt,
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return markFailure(item, message, true, undefined);
  }
}

/**
 * Drain a small, durable batch of article extraction work. Work is serialized
 * per source host and bounded globally, so a single large feed or a slow
 * publisher cannot delay feed refreshes or monopolize scheduler capacity.
 */
export async function sweepPendingFullContent(
  options: { limit?: number; concurrency?: number } = {},
): Promise<FullContentSweepSummary> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_BATCH_SIZE, 50));
  const concurrency = Math.max(
    1,
    Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 8),
  );
  const claimed = await claimDueFullContent(limit);
  const summary = { ...emptySummary(), claimed: claimed.length };
  if (claimed.length === 0) return summary;

  const groups = new Map<string, ClaimedItem[]>();
  for (const item of claimed) {
    const host = hostnameFor(item.url, item.id);
    groups.set(host, [...(groups.get(host) ?? []), item]);
  }
  const hostGroups = [...groups.values()];
  let nextGroup = 0;

  const workers = Array.from(
    { length: Math.min(concurrency, hostGroups.length) },
    async () => {
      while (true) {
        const group = hostGroups[nextGroup++];
        if (!group) return;
        for (const item of group) {
          const outcome = await processClaimedItem(item);
          summary[outcome] += 1;
        }
      }
    },
  );
  await Promise.all(workers);
  return summary;
}

/**
 * Let a reader retry a terminal extraction error. It only requeues an article
 * from one of that reader's subscriptions; the scheduler does the actual HTTP
 * work so an interaction never blocks on an external website.
 */
export async function retryFullContentForUser(
  userId: number,
  itemId: number,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const [item] = await db
    .select({
      id: items.id,
      url: items.url,
      fullContentHtml: items.fullContentHtml,
    })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(eq(items.id, itemId));
  if (!item) return { ok: false, error: "Article not found." };
  if (item.fullContentHtml) return { ok: true };
  if (!item.url) return { ok: false, error: "Article has no link to fetch." };

  await db
    .update(items)
    .set({
      fullContentStatus: "pending",
      fullContentAttempts: 0,
      fullContentNextAt: new Date(),
      fullContentLockedAt: null,
      fullContentLastError: null,
    })
    .where(eq(items.id, itemId));
  return { ok: true };
}

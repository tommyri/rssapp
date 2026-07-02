import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { items, subscriptions } from "@/db/schema";
import { extractFullContent } from "./extract";

export type FullContentResult =
  | { ok: true; html: string }
  | { ok: false; error: string };

/**
 * Full content for one item, extracting and caching on first request.
 * User-scoped: only works for items in feeds the user subscribes to.
 */
export async function getOrExtractFullContent(
  userId: number,
  itemId: number,
): Promise<FullContentResult> {
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
  if (item.fullContentHtml) return { ok: true, html: item.fullContentHtml };
  if (!item.url) return { ok: false, error: "Article has no link to fetch." };

  const result = await extractFullContent(item.url);
  if (result.status === "error") return { ok: false, error: result.error };

  await db
    .update(items)
    .set({ fullContentHtml: result.html })
    .where(eq(items.id, itemId));
  return { ok: true, html: result.html };
}

const AUTO_EXTRACT_CONCURRENCY = 2;

/**
 * If any subscriber of this feed enabled "always load full content", extract
 * article pages for the given newly ingested items. Failures are silent — the
 * feed-provided content remains as the fallback.
 */
export async function autoExtractForFeed(
  feedId: number,
  newItems: { id: number; url: string | null }[],
): Promise<void> {
  const candidates = newItems.filter(
    (i): i is { id: number; url: string } => !!i.url,
  );
  if (candidates.length === 0) return;

  const [wanted] = await db
    .select({ one: sql`1` })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.feedId, feedId),
        sql`${subscriptions.settings}->>'fullContent' = 'true'`,
      ),
    )
    .limit(1);
  if (!wanted) return;

  let index = 0;
  const workers = Array.from(
    { length: Math.min(AUTO_EXTRACT_CONCURRENCY, candidates.length) },
    async () => {
      while (index < candidates.length) {
        const item = candidates[index++];
        const result = await extractFullContent(item.url);
        if (result.status === "ok") {
          await db
            .update(items)
            .set({ fullContentHtml: result.html })
            .where(eq(items.id, item.id));
        }
      }
    },
  );
  await Promise.all(workers);
}

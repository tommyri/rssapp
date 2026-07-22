import { and, asc, desc, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  highlights,
  items,
  savedPages,
  subscriptions,
} from "@/db/schema";
import type {
  ArticleHighlight,
  HighlightAnchor,
  HighlightTarget,
} from "@/lib/highlight-selection";

const highlightFields = {
  id: highlights.id,
  quote: highlights.quote,
  startOffset: highlights.startOffset,
  endOffset: highlights.endOffset,
  note: highlights.note,
};

export interface HighlightSummary extends ArticleHighlight {
  target: HighlightTarget;
  title: string | null;
  source: string | null;
  createdAt: Date;
  updatedAt: Date;
}

async function ownsHighlightTarget(
  userId: number,
  target: HighlightTarget,
): Promise<boolean> {
  if (target.kind === "item") {
    const [item] = await db
      .select({ id: items.id })
      .from(items)
      .innerJoin(
        subscriptions,
        and(
          eq(subscriptions.feedId, items.feedId),
          eq(subscriptions.userId, userId),
        ),
      )
      .where(eq(items.id, target.id));
    return item !== undefined;
  }

  const [page] = await db
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(and(eq(savedPages.id, target.id), eq(savedPages.userId, userId)));
  return page !== undefined;
}

function targetWhere(userId: number, target: HighlightTarget) {
  return target.kind === "item"
    ? and(eq(highlights.userId, userId), eq(highlights.itemId, target.id))
    : and(eq(highlights.userId, userId), eq(highlights.savedPageId, target.id));
}

/** The target remains user-scoped, even when the caller knows a highlight id. */
export async function getHighlightTarget(
  userId: number,
  highlightId: number,
): Promise<HighlightTarget | null> {
  const [highlight] = await db
    .select({ itemId: highlights.itemId, savedPageId: highlights.savedPageId })
    .from(highlights)
    .where(and(eq(highlights.id, highlightId), eq(highlights.userId, userId)));
  if (highlight?.itemId) return { kind: "item", id: highlight.itemId };
  if (highlight?.savedPageId) {
    return { kind: "page", id: highlight.savedPageId };
  }
  return null;
}

/** The sidebar count stays cheap even once a reader has many annotations. */
export async function highlightsCount(userId: number): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(highlights)
    .where(eq(highlights.userId, userId));
  return row?.count ?? 0;
}

/**
 * A unified, newest-touched-first annotation library. Feed items stay scoped
 * through the user's subscription, while saved pages are already per-user.
 */
export async function listHighlightSummaries(
  userId: number,
  notesOnly = false,
): Promise<HighlightSummary[]> {
  const itemConditions = [
    eq(highlights.userId, userId),
    isNotNull(highlights.itemId),
  ];
  const pageConditions = [
    eq(highlights.userId, userId),
    isNotNull(highlights.savedPageId),
  ];
  if (notesOnly) {
    itemConditions.push(isNotNull(highlights.note));
    pageConditions.push(isNotNull(highlights.note));
  }

  const [itemRows, pageRows] = await Promise.all([
    db
      .select({
        ...highlightFields,
        targetId: items.id,
        title: items.title,
        source: sql<
          string | null
        >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
        createdAt: highlights.createdAt,
        updatedAt: highlights.updatedAt,
      })
      .from(highlights)
      .innerJoin(items, eq(items.id, highlights.itemId))
      .innerJoin(feeds, eq(feeds.id, items.feedId))
      .innerJoin(
        subscriptions,
        and(
          eq(subscriptions.feedId, items.feedId),
          eq(subscriptions.userId, userId),
        ),
      )
      .where(and(...itemConditions))
      .orderBy(desc(highlights.updatedAt), desc(highlights.id)),
    db
      .select({
        ...highlightFields,
        targetId: savedPages.id,
        title: savedPages.title,
        source: sql<
          string | null
        >`coalesce(${savedPages.siteName}, ${savedPages.url})`,
        createdAt: highlights.createdAt,
        updatedAt: highlights.updatedAt,
      })
      .from(highlights)
      .innerJoin(savedPages, eq(savedPages.id, highlights.savedPageId))
      .where(and(...pageConditions))
      .orderBy(desc(highlights.updatedAt), desc(highlights.id)),
  ]);

  return [
    ...itemRows.map((highlight) => ({
      ...highlight,
      target: { kind: "item" as const, id: highlight.targetId },
    })),
    ...pageRows.map((highlight) => ({
      ...highlight,
      target: { kind: "page" as const, id: highlight.targetId },
    })),
  ].sort(
    (left, right) =>
      right.updatedAt.getTime() - left.updatedAt.getTime() ||
      right.id - left.id,
  );
}

export async function listHighlights(
  userId: number,
  target: HighlightTarget,
): Promise<ArticleHighlight[]> {
  return db
    .select(highlightFields)
    .from(highlights)
    .where(targetWhere(userId, target))
    .orderBy(asc(highlights.createdAt), asc(highlights.id));
}

export async function createHighlight(
  userId: number,
  target: HighlightTarget,
  anchor: HighlightAnchor,
  note: string | null,
): Promise<ArticleHighlight | null> {
  if (!(await ownsHighlightTarget(userId, target))) return null;
  const [highlight] = await db
    .insert(highlights)
    .values({
      userId,
      itemId: target.kind === "item" ? target.id : null,
      savedPageId: target.kind === "page" ? target.id : null,
      ...anchor,
      note,
    })
    .returning(highlightFields);
  return highlight ?? null;
}

export async function updateHighlightNote(
  userId: number,
  highlightId: number,
  note: string | null,
): Promise<ArticleHighlight | null> {
  const [highlight] = await db
    .update(highlights)
    .set({ note, updatedAt: new Date() })
    .where(and(eq(highlights.id, highlightId), eq(highlights.userId, userId)))
    .returning(highlightFields);
  return highlight ?? null;
}

export async function deleteHighlight(
  userId: number,
  highlightId: number,
): Promise<boolean> {
  const [deleted] = await db
    .delete(highlights)
    .where(and(eq(highlights.id, highlightId), eq(highlights.userId, userId)))
    .returning({ id: highlights.id });
  return deleted !== undefined;
}

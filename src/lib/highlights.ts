import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { highlights, items, savedPages, subscriptions } from "@/db/schema";
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

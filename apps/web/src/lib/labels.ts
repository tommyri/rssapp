import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  itemLabels,
  items,
  labels,
  rules,
  savedPageLabels,
  savedPages,
  subscriptions,
} from "@/db/schema";

export const MAX_LABEL_NAME_LENGTH = 40;

export interface ReaderLabel {
  id: number;
  name: string;
}

export interface LabelSummary extends ReaderLabel {
  count: number;
  ruleCount: number;
}

export type LabelTarget =
  | { kind: "item"; itemId: number }
  | { kind: "page"; savedPageId: number };

/** Trim and normalize whitespace without changing the user's chosen casing. */
export function normalizeLabelName(rawName: string): string | null {
  const name = rawName.trim().replace(/\s+/g, " ");
  return name.length > 0 && name.length <= MAX_LABEL_NAME_LENGTH ? name : null;
}

export async function listLabels(userId: number): Promise<ReaderLabel[]> {
  return db
    .select({ id: labels.id, name: labels.name })
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.name));
}

/** Labels plus their combined feed-article and saved-page assignment count. */
export async function listLabelSummaries(
  userId: number,
): Promise<LabelSummary[]> {
  return db
    .select({
      id: labels.id,
      name: labels.name,
      count: sql<number>`(
        select count(*) from ${itemLabels}
        where ${itemLabels.labelId} = ${labels.id}
      ) + (
        select count(*) from ${savedPageLabels}
        where ${savedPageLabels.labelId} = ${labels.id}
      )`.mapWith(Number),
      ruleCount: sql<number>`(
        select count(*) from ${rules}
        where ${rules.labelId} = ${labels.id}
      )`.mapWith(Number),
    })
    .from(labels)
    .where(eq(labels.userId, userId))
    .orderBy(asc(labels.name));
}

export async function createLabel(
  userId: number,
  rawName: string,
): Promise<{ ok: true; label: ReaderLabel } | { ok: false; error: string }> {
  const name = normalizeLabelName(rawName);
  if (!name) {
    return {
      ok: false,
      error: `Enter a label between 1 and ${MAX_LABEL_NAME_LENGTH} characters.`,
    };
  }

  const [existing] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.userId, userId),
        sql`lower(${labels.name}) = lower(${name})`,
      ),
    );
  if (existing)
    return { ok: false, error: "You already have a label with that name." };

  const [label] = await db
    .insert(labels)
    .values({ userId, name })
    .returning({ id: labels.id, name: labels.name });
  if (!label) return { ok: false, error: "Could not create that label." };
  return { ok: true, label };
}

export async function renameLabel(
  userId: number,
  labelId: number,
  rawName: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const name = normalizeLabelName(rawName);
  if (!name) {
    return {
      ok: false,
      error: `Enter a label between 1 and ${MAX_LABEL_NAME_LENGTH} characters.`,
    };
  }

  const [existing] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(
      and(
        eq(labels.userId, userId),
        sql`lower(${labels.name}) = lower(${name})`,
      ),
    );
  if (existing && existing.id !== labelId) {
    return { ok: false, error: "You already have a label with that name." };
  }

  const [updated] = await db
    .update(labels)
    .set({ name })
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)))
    .returning({ id: labels.id });
  return updated
    ? { ok: true }
    : { ok: false, error: "That label is no longer available." };
}

export async function deleteLabel(
  userId: number,
  labelId: number,
): Promise<void> {
  await db
    .delete(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
}

async function ownsLabel(userId: number, labelId: number): Promise<boolean> {
  const [label] = await db
    .select({ id: labels.id })
    .from(labels)
    .where(and(eq(labels.id, labelId), eq(labels.userId, userId)));
  return label !== undefined;
}

async function ownsSubscribedItem(
  userId: number,
  itemId: number,
): Promise<boolean> {
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
    .where(eq(items.id, itemId));
  return item !== undefined;
}

async function ownsSavedPage(
  userId: number,
  savedPageId: number,
): Promise<boolean> {
  const [page] = await db
    .select({ id: savedPages.id })
    .from(savedPages)
    .where(and(eq(savedPages.id, savedPageId), eq(savedPages.userId, userId)));
  return page !== undefined;
}

/** Safely applies or removes a user-owned label from one user-visible entry. */
export async function setLabelAssignment(
  userId: number,
  labelId: number,
  target: LabelTarget,
  assigned: boolean,
): Promise<boolean> {
  const ownsTarget =
    target.kind === "item"
      ? ownsSubscribedItem(userId, target.itemId)
      : ownsSavedPage(userId, target.savedPageId);
  const [labelOwned, targetOwned] = await Promise.all([
    ownsLabel(userId, labelId),
    ownsTarget,
  ]);
  if (!labelOwned || !targetOwned) return false;

  if (target.kind === "item") {
    if (assigned) {
      await db
        .insert(itemLabels)
        .values({ labelId, itemId: target.itemId })
        .onConflictDoNothing();
    } else {
      await db
        .delete(itemLabels)
        .where(
          and(
            eq(itemLabels.labelId, labelId),
            eq(itemLabels.itemId, target.itemId),
          ),
        );
    }
  } else if (assigned) {
    await db
      .insert(savedPageLabels)
      .values({ labelId, savedPageId: target.savedPageId })
      .onConflictDoNothing();
  } else {
    await db
      .delete(savedPageLabels)
      .where(
        and(
          eq(savedPageLabels.labelId, labelId),
          eq(savedPageLabels.savedPageId, target.savedPageId),
        ),
      );
  }
  return true;
}

/** Builds a lookup keyed as `${kind}:${id}` for an already user-scoped list. */
export async function labelsForTargets(
  userId: number,
  targets: LabelTarget[],
): Promise<Map<string, ReaderLabel[]>> {
  const itemIds = targets
    .filter(
      (target): target is Extract<LabelTarget, { kind: "item" }> =>
        target.kind === "item",
    )
    .map((target) => target.itemId);
  const savedPageIds = targets
    .filter(
      (target): target is Extract<LabelTarget, { kind: "page" }> =>
        target.kind === "page",
    )
    .map((target) => target.savedPageId);

  const [itemRows, pageRows] = await Promise.all([
    itemIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            itemId: itemLabels.itemId,
            id: labels.id,
            name: labels.name,
          })
          .from(itemLabels)
          .innerJoin(labels, eq(labels.id, itemLabels.labelId))
          .where(
            and(eq(labels.userId, userId), inArray(itemLabels.itemId, itemIds)),
          )
          .orderBy(asc(labels.name)),
    savedPageIds.length === 0
      ? Promise.resolve([])
      : db
          .select({
            savedPageId: savedPageLabels.savedPageId,
            id: labels.id,
            name: labels.name,
          })
          .from(savedPageLabels)
          .innerJoin(labels, eq(labels.id, savedPageLabels.labelId))
          .where(
            and(
              eq(labels.userId, userId),
              inArray(savedPageLabels.savedPageId, savedPageIds),
            ),
          )
          .orderBy(asc(labels.name)),
  ]);

  const byTarget = new Map<string, ReaderLabel[]>();
  for (const row of itemRows) {
    const key = `item:${row.itemId}`;
    byTarget.set(key, [
      ...(byTarget.get(key) ?? []),
      { id: row.id, name: row.name },
    ]);
  }
  for (const row of pageRows) {
    const key = `page:${row.savedPageId}`;
    byTarget.set(key, [
      ...(byTarget.get(key) ?? []),
      { id: row.id, name: row.name },
    ]);
  }
  return byTarget;
}

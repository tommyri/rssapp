import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeds, itemStates, items, rules, subscriptions } from "@/db/schema";
import {
  type ActionFlags,
  combineActions,
  type MatchableItem,
  type RuleAction,
  type RuleField,
  type RuleMatchType,
  ruleMatches,
} from "./engine";
import {
  type RulePreviewCandidate,
  type RulePreviewMatch,
  rulePreviewMatches,
} from "./preview";

const RULE_PREVIEW_SAMPLE_SIZE = 50;

export interface RuleRow {
  userId: number;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  action: RuleAction;
}

export interface IngestedItem extends MatchableItem {
  id: number;
}

/** Upsert state flags, OR-ing with whatever state already exists. */
async function upsertFlags(
  entries: { userId: number; itemId: number; flags: ActionFlags }[],
): Promise<void> {
  if (entries.length === 0) return;
  const now = new Date();

  await db
    .insert(itemStates)
    .values(
      entries.map(({ userId, itemId, flags }) => ({
        userId,
        itemId,
        muted: flags.muted,
        read: flags.read,
        readAt: flags.read ? now : null,
        starred: flags.starred,
        starredAt: flags.starred ? now : null,
      })),
    )
    .onConflictDoUpdate({
      target: [itemStates.userId, itemStates.itemId],
      set: {
        muted: sql`${itemStates.muted} or excluded.muted`,
        read: sql`${itemStates.read} or excluded.read`,
        readAt: sql`coalesce(${itemStates.readAt}, excluded.read_at)`,
        starred: sql`${itemStates.starred} or excluded.starred`,
        starredAt: sql`coalesce(${itemStates.starredAt}, excluded.starred_at)`,
      },
    });
}

/** Evaluate rules against items and produce the state rows to write. */
function evaluate(
  ruleRows: RuleRow[],
  candidates: IngestedItem[],
): { userId: number; itemId: number; flags: ActionFlags }[] {
  const out: { userId: number; itemId: number; flags: ActionFlags }[] = [];
  const byUser = new Map<number, RuleRow[]>();
  for (const r of ruleRows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  for (const [userId, userRules] of byUser) {
    for (const item of candidates) {
      const actions = userRules
        .filter((r) => ruleMatches(r, item))
        .map((r) => r.action);
      if (actions.length === 0) continue;
      out.push({ userId, itemId: item.id, flags: combineActions(actions) });
    }
  }
  return out;
}

/**
 * Apply every subscriber's enabled rules to items just ingested for a feed.
 * Called from the ingest pipeline after new items are inserted.
 */
export async function applyRulesToNewItems(
  feedId: number,
  newItems: IngestedItem[],
): Promise<void> {
  if (newItems.length === 0) return;

  // Enabled rules of this feed's subscribers, scoped to this feed or to all feeds.
  const ruleRows = (await db
    .select({
      userId: rules.userId,
      field: rules.field,
      matchType: rules.matchType,
      pattern: rules.pattern,
      action: rules.action,
    })
    .from(rules)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, rules.userId),
        eq(subscriptions.feedId, feedId),
      ),
    )
    .where(
      and(
        eq(rules.enabled, true),
        or(isNull(rules.feedId), eq(rules.feedId, feedId)),
      ),
    )) as RuleRow[];
  if (ruleRows.length === 0) return;

  await upsertFlags(evaluate(ruleRows, newItems));
}

/**
 * Apply one rule to the user's existing items (its feed, or all subscribed
 * feeds). Used when a rule is created. Returns how many items matched.
 */
export async function applyRuleToExistingItems(
  userId: number,
  rule: Omit<RuleRow, "userId"> & { feedId: number | null },
): Promise<number> {
  const candidates = (await db
    .select({
      id: items.id,
      title: items.title,
      author: items.author,
      contentHtml: items.contentHtml,
    })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(
      rule.feedId ? eq(items.feedId, rule.feedId) : undefined,
    )) as IngestedItem[];

  const entries = evaluate([{ ...rule, userId }], candidates);
  await upsertFlags(entries);
  return entries.length;
}

/** Test a draft against a bounded, user-scoped recent sample without mutation. */
export async function previewRuleAgainstRecentItems(
  userId: number,
  rule: Omit<RuleRow, "userId"> & { feedId: number | null },
): Promise<{ sampleSize: number; matches: RulePreviewMatch[] }> {
  const candidates = (await db
    .select({
      id: items.id,
      title: items.title,
      author: items.author,
      contentHtml: items.contentHtml,
      feedTitle: feeds.title,
      publishedAt: items.publishedAt,
    })
    .from(items)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .where(rule.feedId ? eq(items.feedId, rule.feedId) : undefined)
    .orderBy(desc(items.publishedAt), desc(items.id))
    .limit(RULE_PREVIEW_SAMPLE_SIZE)) as RulePreviewCandidate[];

  return {
    sampleSize: candidates.length,
    matches: rulePreviewMatches(rule, candidates),
  };
}

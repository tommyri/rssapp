import { and, desc, eq, isNull, or, sql } from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  itemLabels,
  itemStates,
  items,
  notifications,
  rules,
  subscriptions,
  users,
} from "@/db/schema";
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
export const RULE_EXISTING_APPLY_LIMIT = 500;
const ruleItemSort = sql`coalesce(${items.publishedAt}, ${items.createdAt})`;

export interface RuleRow {
  /** Needed to persist one durable notification per matching article. */
  id?: number;
  userId: number;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  action: RuleAction;
  labelId: number | null;
  /** The user may silence the inbox without disabling their automation. */
  notificationsEnabled?: boolean;
}

export interface IngestedItem extends MatchableItem {
  id: number;
}

interface RuleApplication {
  userId: number;
  itemId: number;
  flags: ActionFlags;
  labelIds: number[];
  notifications: NotificationApplication[];
}

interface NotificationApplication {
  userId: number;
  itemId: number;
  ruleId: number;
  ruleField: RuleField;
  ruleMatchType: RuleMatchType;
  rulePattern: string;
}

export interface ExistingRuleApplicationResult {
  scanned: number;
  matched: number;
  /** More matching candidates may exist beyond the newest bounded batch. */
  hasMore: boolean;
}

/** Apply matched state flags and labels without removing existing choices. */
async function applyEffects(entries: RuleApplication[]): Promise<void> {
  if (entries.length === 0) return;
  const stateEntries = entries.filter(
    ({ flags }) => flags.muted || flags.read || flags.starred,
  );
  const labelAssignments = new Map<
    string,
    { labelId: number; itemId: number }
  >();
  for (const { itemId, labelIds } of entries) {
    for (const labelId of labelIds) {
      labelAssignments.set(`${labelId}:${itemId}`, { labelId, itemId });
    }
  }
  const notificationEntries = entries.flatMap(({ notifications }) =>
    notifications.map((notification) => notification),
  );
  if (
    stateEntries.length === 0 &&
    labelAssignments.size === 0 &&
    notificationEntries.length === 0
  ) {
    return;
  }

  const now = new Date();

  await db.transaction(async (tx) => {
    if (stateEntries.length > 0) {
      await tx
        .insert(itemStates)
        .values(
          stateEntries.map(({ userId, itemId, flags }) => ({
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

    if (labelAssignments.size > 0) {
      await tx
        .insert(itemLabels)
        .values([...labelAssignments.values()])
        .onConflictDoNothing();
    }

    if (notificationEntries.length > 0) {
      await tx
        .insert(notifications)
        .values(notificationEntries)
        .onConflictDoNothing();
    }
  });
}

/** Evaluate rules against items and produce the state rows to write. */
function evaluate(
  ruleRows: RuleRow[],
  candidates: IngestedItem[],
  createNotifications = false,
): RuleApplication[] {
  const out: RuleApplication[] = [];
  const byUser = new Map<number, RuleRow[]>();
  for (const r of ruleRows) {
    const list = byUser.get(r.userId) ?? [];
    list.push(r);
    byUser.set(r.userId, list);
  }

  for (const [userId, userRules] of byUser) {
    for (const item of candidates) {
      const matches = userRules.filter((rule) => ruleMatches(rule, item));
      if (matches.length === 0) continue;
      const notifications = matches.flatMap((rule) =>
        createNotifications &&
        rule.action === "notify" &&
        rule.id !== undefined &&
        rule.notificationsEnabled !== false
          ? [
              {
                userId,
                itemId: item.id,
                ruleId: rule.id,
                ruleField: rule.field,
                ruleMatchType: rule.matchType,
                rulePattern: rule.pattern,
              },
            ]
          : [],
      );
      out.push({
        userId,
        itemId: item.id,
        flags: combineActions(matches.map((rule) => rule.action)),
        labelIds: matches.flatMap((rule) =>
          rule.action === "tag" && rule.labelId !== null ? [rule.labelId] : [],
        ),
        notifications,
      });
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
      id: rules.id,
      userId: rules.userId,
      field: rules.field,
      matchType: rules.matchType,
      pattern: rules.pattern,
      action: rules.action,
      labelId: rules.labelId,
      notificationsEnabled: sql<boolean>`coalesce(${users.settings}->>'inAppRuleAlerts', 'true') = 'true'`,
    })
    .from(rules)
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, rules.userId),
        eq(subscriptions.feedId, feedId),
      ),
    )
    .innerJoin(users, eq(users.id, rules.userId))
    .where(
      and(
        eq(rules.enabled, true),
        or(isNull(rules.feedId), eq(rules.feedId, feedId)),
      ),
    )) as RuleRow[];
  if (ruleRows.length === 0) return;

  await applyEffects(evaluate(ruleRows, newItems, true));
}

/**
 * Apply one rule to the user's existing items (its feed, or all subscribed
 * feeds). The newest batch is deliberately bounded: a broad rule must never
 * turn a routine UI action into an unbounded mutation.
 */
export async function applyRuleToExistingItems(
  userId: number,
  rule: Omit<RuleRow, "userId"> & { feedId: number | null },
  notificationsEnabled = true,
): Promise<ExistingRuleApplicationResult> {
  const rows = (await db
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
    .where(rule.feedId ? eq(items.feedId, rule.feedId) : undefined)
    .orderBy(desc(ruleItemSort), desc(items.id))
    .limit(RULE_EXISTING_APPLY_LIMIT + 1)) as IngestedItem[];
  const candidates = rows.slice(0, RULE_EXISTING_APPLY_LIMIT);

  // A saved rule only alerts for its existing matches after the reader makes
  // this explicit batch request. Creating a rule itself remains non-retroactive.
  const entries = evaluate(
    [{ ...rule, userId, notificationsEnabled }],
    candidates,
    rule.action === "notify",
  );
  await applyEffects(entries);
  return {
    scanned: candidates.length,
    matched: entries.length,
    hasMore: rows.length > RULE_EXISTING_APPLY_LIMIT,
  };
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
    .orderBy(desc(ruleItemSort), desc(items.id))
    .limit(RULE_PREVIEW_SAMPLE_SIZE)) as RulePreviewCandidate[];

  return {
    sampleSize: candidates.length,
    matches: rulePreviewMatches(rule, candidates),
  };
}

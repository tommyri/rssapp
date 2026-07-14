import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { feeds, labels, rules } from "@/db/schema";
import type { RuleAction, RuleField, RuleMatchType } from "./engine";

export interface RuleListEntry {
  id: number;
  feedId: number | null;
  feedTitle: string | null;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  action: RuleAction;
  labelId: number | null;
  labelName: string | null;
  enabled: boolean;
}

export async function listRules(userId: number): Promise<RuleListEntry[]> {
  const rows = await db
    .select({
      id: rules.id,
      feedId: rules.feedId,
      feedTitle: feeds.title,
      field: rules.field,
      matchType: rules.matchType,
      pattern: rules.pattern,
      action: rules.action,
      labelId: rules.labelId,
      labelName: labels.name,
      enabled: rules.enabled,
    })
    .from(rules)
    .leftJoin(feeds, eq(feeds.id, rules.feedId))
    .leftJoin(labels, eq(labels.id, rules.labelId))
    .where(eq(rules.userId, userId))
    .orderBy(desc(rules.id));
  return rows as RuleListEntry[];
}

/** One current rule, scoped to its owner for explicit batch application. */
export async function getRule(
  userId: number,
  ruleId: number,
): Promise<RuleListEntry | null> {
  const [row] = await db
    .select({
      id: rules.id,
      feedId: rules.feedId,
      feedTitle: feeds.title,
      field: rules.field,
      matchType: rules.matchType,
      pattern: rules.pattern,
      action: rules.action,
      labelId: rules.labelId,
      labelName: labels.name,
      enabled: rules.enabled,
    })
    .from(rules)
    .leftJoin(feeds, eq(feeds.id, rules.feedId))
    .leftJoin(labels, eq(labels.id, rules.labelId))
    .where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
  return (row as RuleListEntry | undefined) ?? null;
}

export interface NewRule {
  feedId: number | null;
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
  action: RuleAction;
  labelId: number | null;
}

export async function createRule(
  userId: number,
  rule: NewRule,
): Promise<number> {
  const [row] = await db
    .insert(rules)
    .values({ userId, ...rule })
    .returning({ id: rules.id });
  return row.id;
}

export async function deleteRule(
  userId: number,
  ruleId: number,
): Promise<void> {
  await db
    .delete(rules)
    .where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
}

export async function setRuleEnabled(
  userId: number,
  ruleId: number,
  enabled: boolean,
): Promise<void> {
  await db
    .update(rules)
    .set({ enabled })
    .where(and(eq(rules.userId, userId), eq(rules.id, ruleId)));
}

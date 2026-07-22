import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { feeds, items, notifications, subscriptions } from "@/db/schema";
import type { RuleField, RuleMatchType } from "@/lib/rules/engine";

export interface NotificationSummary {
  id: number;
  itemId: number;
  title: string | null;
  source: string | null;
  ruleField: RuleField;
  ruleMatchType: RuleMatchType;
  rulePattern: string;
  readAt: Date | null;
  createdAt: Date;
}

/** A concise explanation that stays valid even if the originating rule is gone. */
export function notificationReason({
  ruleField,
  ruleMatchType,
  rulePattern,
}: Pick<
  NotificationSummary,
  "ruleField" | "ruleMatchType" | "rulePattern"
>): string {
  return `${ruleField} ${ruleMatchType === "contains" ? "contains" : "matches"} “${rulePattern}”`;
}

const subscribedNotificationJoins = (userId: number) =>
  and(eq(subscriptions.feedId, items.feedId), eq(subscriptions.userId, userId));

/** Newest inbox entries whose articles still belong to this reader. */
export async function listNotifications(
  userId: number,
  limit = 100,
): Promise<NotificationSummary[]> {
  const rows = await db
    .select({
      id: notifications.id,
      itemId: items.id,
      title: items.title,
      source: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      ruleField: notifications.ruleField,
      ruleMatchType: notifications.ruleMatchType,
      rulePattern: notifications.rulePattern,
      readAt: notifications.readAt,
      createdAt: notifications.createdAt,
    })
    .from(notifications)
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .innerJoin(subscriptions, subscribedNotificationJoins(userId))
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(limit);
  return rows as NotificationSummary[];
}

/** Drives the compact unread badge in the reader sidebar. */
export async function unreadNotificationsCount(
  userId: number,
): Promise<number> {
  const [row] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(notifications)
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(subscriptions, subscribedNotificationJoins(userId))
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return row?.count ?? 0;
}

/** Only return a target that is both owned by the user and still subscribed. */
export async function notificationItemId(
  userId: number,
  notificationId: number,
): Promise<number | null> {
  const [row] = await db
    .select({ itemId: notifications.itemId })
    .from(notifications)
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(subscriptions, subscribedNotificationJoins(userId))
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    );
  return row?.itemId ?? null;
}

export async function markNotificationRead(
  userId: number,
  notificationId: number,
): Promise<boolean> {
  const rows = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(
      and(
        eq(notifications.id, notificationId),
        eq(notifications.userId, userId),
      ),
    )
    .returning({ id: notifications.id });
  return rows.length === 1;
}

export async function markAllNotificationsRead(userId: number): Promise<void> {
  await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
}

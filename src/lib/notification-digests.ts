import {
  and,
  desc,
  eq,
  inArray,
  isNotNull,
  isNull,
  lt,
  lte,
  ne,
  sql,
} from "drizzle-orm";
import { db } from "@/db";
import {
  feeds,
  items,
  type NotificationDigestCadence,
  type NotificationDigestDeliveryStatus,
  notificationDigestDeliveries,
  notificationDigestItems,
  notificationDigestSettings,
  notifications,
  subscriptions,
  users,
} from "@/db/schema";
import {
  type NotificationDigestEmailItem,
  renderNotificationDigestEmail,
} from "@/lib/notification-digest-email";
import {
  type NotificationDigestSchedule,
  nextNotificationDigestRun,
} from "@/lib/notification-digest-schedule";
import {
  EmailDeliveryError,
  isEmailDeliveryAvailable,
  sendEmailMessage,
} from "@/lib/transactional-email";

const MAX_FROZEN_ITEMS = 500;
const DELIVERY_BATCH_SIZE = 20;
const MAX_ATTEMPTS = 6;
const STALE_PROCESSING_MS = 15 * 60_000;
const TEST_COOLDOWN_MS = 60_000;

export interface NotificationDigestPreferences {
  configured: boolean;
  enabled: boolean;
  cadence: NotificationDigestCadence;
  timezone: string;
  deliveryHour: number;
  deliveryMinute: number;
  weekday: number;
  nextRunAt: Date | null;
  lastSentAt: Date | null;
  lastDeliveryStatus: NotificationDigestDeliveryStatus | null;
  lastDeliveryError: string | null;
}

export interface SaveNotificationDigestPreferences
  extends NotificationDigestSchedule {
  userId: number;
  enabled: boolean;
}

export class NotificationDigestPreferenceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NotificationDigestPreferenceError";
  }
}

function defaultPreferences(): NotificationDigestPreferences {
  return {
    configured: false,
    enabled: false,
    cadence: "daily",
    timezone: "UTC",
    deliveryHour: 8,
    deliveryMinute: 0,
    weekday: 1,
    nextRunAt: null,
    lastSentAt: null,
    lastDeliveryStatus: null,
    lastDeliveryError: null,
  };
}

export async function getNotificationDigestPreferences(
  userId: number,
): Promise<NotificationDigestPreferences> {
  const [setting, lastDelivery] = await Promise.all([
    db.query.notificationDigestSettings.findFirst({
      where: eq(notificationDigestSettings.userId, userId),
    }),
    db.query.notificationDigestDeliveries.findFirst({
      where: eq(notificationDigestDeliveries.userId, userId),
      orderBy: [
        desc(notificationDigestDeliveries.createdAt),
        desc(notificationDigestDeliveries.id),
      ],
    }),
  ]);
  if (!setting) return defaultPreferences();
  return {
    configured: true,
    enabled: setting.enabled,
    cadence: setting.cadence,
    timezone: setting.timezone,
    deliveryHour: setting.deliveryHour,
    deliveryMinute: setting.deliveryMinute,
    weekday: setting.weekday,
    nextRunAt: setting.nextRunAt,
    lastSentAt: setting.lastSentAt,
    lastDeliveryStatus: lastDelivery?.status ?? null,
    lastDeliveryError: lastDelivery?.lastError ?? null,
  };
}

export async function saveNotificationDigestPreferences({
  userId,
  enabled,
  cadence,
  timezone,
  deliveryHour,
  deliveryMinute,
  weekday,
}: SaveNotificationDigestPreferences): Promise<Date | null> {
  const user = await db.query.users.findFirst({
    where: and(eq(users.id, userId), eq(users.status, "active")),
  });
  if (!user) {
    throw new NotificationDigestPreferenceError(
      "Your account is no longer available.",
    );
  }
  if (enabled && !user.emailVerifiedAt) {
    throw new NotificationDigestPreferenceError(
      "Verify your account email before enabling digests.",
    );
  }
  if (enabled && !isEmailDeliveryAvailable()) {
    throw new NotificationDigestPreferenceError(
      "Email delivery is not configured for this deployment.",
    );
  }

  const now = new Date();
  const nextRunAt = enabled
    ? nextNotificationDigestRun(
        { cadence, timezone, deliveryHour, deliveryMinute, weekday },
        now,
      )
    : null;
  await db
    .insert(notificationDigestSettings)
    .values({
      userId,
      enabled,
      cadence,
      timezone,
      deliveryHour,
      deliveryMinute,
      weekday,
      nextRunAt,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: notificationDigestSettings.userId,
      set: {
        enabled,
        cadence,
        timezone,
        deliveryHour,
        deliveryMinute,
        weekday,
        nextRunAt,
        updatedAt: now,
      },
    });
  return nextRunAt;
}

export async function disableNotificationDigests(
  userId: number,
): Promise<boolean> {
  const now = new Date();
  return db.transaction(async (tx) => {
    const rows = await tx
      .update(notificationDigestSettings)
      .set({ enabled: false, nextRunAt: null, updatedAt: now })
      .where(eq(notificationDigestSettings.userId, userId))
      .returning({ userId: notificationDigestSettings.userId });
    // Retain membership so an old queued digest cannot reappear if the reader
    // later opts in again, but prevent every job that has not begun delivery.
    await tx
      .update(notificationDigestDeliveries)
      .set({
        status: "skipped",
        completedAt: now,
        startedAt: null,
        lastError: null,
      })
      .where(
        and(
          eq(notificationDigestDeliveries.userId, userId),
          inArray(notificationDigestDeliveries.status, ["pending", "retrying"]),
        ),
      );
    return rows.length === 1;
  });
}

function notificationReason(row: {
  ruleField: string;
  ruleMatchType: string;
  rulePattern: string;
}): string {
  return `${row.ruleField} ${row.ruleMatchType === "contains" ? "contains" : "matches"} “${row.rulePattern}”`;
}

async function listDeliveryItems(
  userId: number,
  deliveryId: number,
): Promise<NotificationDigestEmailItem[]> {
  const rows = await db
    .select({
      notificationId: notifications.id,
      title: items.title,
      source: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      ruleField: notifications.ruleField,
      ruleMatchType: notifications.ruleMatchType,
      rulePattern: notifications.rulePattern,
    })
    .from(notificationDigestItems)
    .innerJoin(
      notifications,
      eq(notifications.id, notificationDigestItems.notificationId),
    )
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(
      and(
        eq(notificationDigestItems.deliveryId, deliveryId),
        eq(notifications.userId, userId),
        isNull(notifications.readAt),
      ),
    )
    .orderBy(desc(notifications.createdAt), desc(notifications.id));
  return rows.map((row) => ({ ...row, reason: notificationReason(row) }));
}

async function listTestItems(
  userId: number,
): Promise<NotificationDigestEmailItem[]> {
  const rows = await db
    .select({
      notificationId: notifications.id,
      title: items.title,
      source: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
      ruleField: notifications.ruleField,
      ruleMatchType: notifications.ruleMatchType,
      rulePattern: notifications.rulePattern,
    })
    .from(notifications)
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.feedId, items.feedId),
        eq(subscriptions.userId, userId),
      ),
    )
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(20);
  return rows.map((row) => ({ ...row, reason: notificationReason(row) }));
}

export async function sendTestNotificationDigest(
  userId: number,
): Promise<void> {
  if (!isEmailDeliveryAvailable()) {
    throw new NotificationDigestPreferenceError(
      "Email delivery is not configured for this deployment.",
    );
  }
  const now = new Date();
  const claim = await db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`digest-test:${userId}`}))`,
    );
    const [user] = await tx
      .select({
        email: users.email,
        emailVerifiedAt: users.emailVerifiedAt,
        status: users.status,
      })
      .from(users)
      .where(eq(users.id, userId))
      .for("update");
    if (!user || user.status !== "active") {
      throw new NotificationDigestPreferenceError(
        "Your account is no longer available.",
      );
    }
    if (!user.emailVerifiedAt) {
      throw new NotificationDigestPreferenceError(
        "Verify your account email before sending a test.",
      );
    }

    const [setting] = await tx
      .select({ lastTestSentAt: notificationDigestSettings.lastTestSentAt })
      .from(notificationDigestSettings)
      .where(eq(notificationDigestSettings.userId, userId))
      .for("update");
    if (
      setting?.lastTestSentAt &&
      now.getTime() - setting.lastTestSentAt.getTime() < TEST_COOLDOWN_MS
    ) {
      throw new NotificationDigestPreferenceError(
        "A test digest was sent recently. Wait a minute before trying again.",
      );
    }
    if (setting) {
      await tx
        .update(notificationDigestSettings)
        .set({ lastTestSentAt: now, updatedAt: now })
        .where(eq(notificationDigestSettings.userId, userId));
    } else {
      await tx.insert(notificationDigestSettings).values({
        userId,
        lastTestSentAt: now,
        updatedAt: now,
      });
    }
    return { email: user.email, claimedAt: now };
  });

  const email = renderNotificationDigestEmail({
    userId,
    items: await listTestItems(userId),
    linkCreatedAt: claim.claimedAt,
    test: true,
  });
  // Keep the one-minute claim even when delivery fails. Test sends are an
  // outbound-email endpoint and must not become unbounded provider traffic.
  await sendEmailMessage({
    to: claim.email,
    ...email,
    idempotencyKey: `rssapp-digest-test-${userId}-${claim.claimedAt.getTime()}`,
  });
}

/** Freeze all currently unread, previously undelivered matches for due slots. */
async function createDueDeliveries(now: Date, limit = 50): Promise<number> {
  const due = await db
    .select({ userId: notificationDigestSettings.userId })
    .from(notificationDigestSettings)
    .innerJoin(users, eq(users.id, notificationDigestSettings.userId))
    .where(
      and(
        eq(notificationDigestSettings.enabled, true),
        isNotNull(notificationDigestSettings.nextRunAt),
        lte(notificationDigestSettings.nextRunAt, now),
        eq(users.status, "active"),
        isNotNull(users.emailVerifiedAt),
      ),
    )
    .orderBy(notificationDigestSettings.nextRunAt)
    .limit(limit);

  let created = 0;
  for (const candidate of due) {
    const made = await db.transaction(async (tx) => {
      const [setting] = await tx
        .select()
        .from(notificationDigestSettings)
        .where(
          and(
            eq(notificationDigestSettings.userId, candidate.userId),
            eq(notificationDigestSettings.enabled, true),
            isNotNull(notificationDigestSettings.nextRunAt),
            lte(notificationDigestSettings.nextRunAt, now),
          ),
        )
        .for("update", { skipLocked: true });
      if (!setting?.nextRunAt) return false;

      const [delivery] = await tx
        .insert(notificationDigestDeliveries)
        .values({
          userId: setting.userId,
          scheduledFor: setting.nextRunAt,
          nextAttemptAt: now,
        })
        .onConflictDoNothing()
        .returning({ id: notificationDigestDeliveries.id });
      if (!delivery) return false;

      const candidates = await tx
        .select({ notificationId: notifications.id })
        .from(notifications)
        .innerJoin(items, eq(items.id, notifications.itemId))
        .innerJoin(
          subscriptions,
          and(
            eq(subscriptions.feedId, items.feedId),
            eq(subscriptions.userId, setting.userId),
          ),
        )
        .leftJoin(
          notificationDigestItems,
          eq(notificationDigestItems.notificationId, notifications.id),
        )
        .where(
          and(
            eq(notifications.userId, setting.userId),
            isNull(notifications.readAt),
            isNull(notificationDigestItems.notificationId),
          ),
        )
        .orderBy(desc(notifications.createdAt), desc(notifications.id))
        .limit(MAX_FROZEN_ITEMS);
      if (candidates.length > 0) {
        await tx.insert(notificationDigestItems).values(
          candidates.map(({ notificationId }) => ({
            deliveryId: delivery.id,
            notificationId,
          })),
        );
      }

      const nextRunAt = nextNotificationDigestRun(
        {
          cadence: setting.cadence,
          timezone: setting.timezone,
          deliveryHour: setting.deliveryHour,
          deliveryMinute: setting.deliveryMinute,
          weekday: setting.weekday,
        },
        now,
      );
      await tx
        .update(notificationDigestSettings)
        .set({ nextRunAt, updatedAt: now })
        .where(eq(notificationDigestSettings.userId, setting.userId));
      return true;
    });
    if (made) created += 1;
  }
  return created;
}

interface ClaimedDelivery {
  id: number;
  userId: number;
  createdAt: Date;
  attemptCount: number;
  recipientEmail: string | null;
  emailSubject: string | null;
  emailText: string | null;
  emailHtml: string | null;
}

async function claimDeliveries(now: Date): Promise<ClaimedDelivery[]> {
  await db
    .update(notificationDigestDeliveries)
    .set({ status: "retrying", nextAttemptAt: now, startedAt: null })
    .where(
      and(
        eq(notificationDigestDeliveries.status, "processing"),
        lt(
          notificationDigestDeliveries.startedAt,
          new Date(now.getTime() - STALE_PROCESSING_MS),
        ),
      ),
    );
  const candidates = await db
    .select({ id: notificationDigestDeliveries.id })
    .from(notificationDigestDeliveries)
    .where(
      and(
        inArray(notificationDigestDeliveries.status, ["pending", "retrying"]),
        lte(notificationDigestDeliveries.nextAttemptAt, now),
      ),
    )
    .orderBy(
      notificationDigestDeliveries.nextAttemptAt,
      notificationDigestDeliveries.createdAt,
    )
    .limit(DELIVERY_BATCH_SIZE);

  const claimed: ClaimedDelivery[] = [];
  for (const candidate of candidates) {
    const [row] = await db
      .update(notificationDigestDeliveries)
      .set({
        status: "processing",
        startedAt: now,
        attemptCount: sql`${notificationDigestDeliveries.attemptCount} + 1`,
      })
      .where(
        and(
          eq(notificationDigestDeliveries.id, candidate.id),
          inArray(notificationDigestDeliveries.status, ["pending", "retrying"]),
          lte(notificationDigestDeliveries.nextAttemptAt, now),
        ),
      )
      .returning({
        id: notificationDigestDeliveries.id,
        userId: notificationDigestDeliveries.userId,
        createdAt: notificationDigestDeliveries.createdAt,
        attemptCount: notificationDigestDeliveries.attemptCount,
        recipientEmail: notificationDigestDeliveries.recipientEmail,
        emailSubject: notificationDigestDeliveries.emailSubject,
        emailText: notificationDigestDeliveries.emailText,
        emailHtml: notificationDigestDeliveries.emailHtml,
      });
    if (row) claimed.push(row);
  }
  return claimed;
}

async function completeWithoutSending(
  deliveryId: number,
  status: "skipped" | "failed",
  now: Date,
  lastError: string | null = null,
): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .update(notificationDigestDeliveries)
      .set({ status, completedAt: now, startedAt: null, lastError })
      .where(eq(notificationDigestDeliveries.id, deliveryId));
    if (status === "failed") {
      // A later scheduled digest may pick these notifications up again.
      await tx
        .delete(notificationDigestItems)
        .where(eq(notificationDigestItems.deliveryId, deliveryId));
    }
  });
}

async function deliverClaimed(
  delivery: ClaimedDelivery,
  now: Date,
): Promise<"sent" | "skipped" | "retrying" | "failed"> {
  const [user, setting] = await Promise.all([
    db.query.users.findFirst({ where: eq(users.id, delivery.userId) }),
    db.query.notificationDigestSettings.findFirst({
      where: eq(notificationDigestSettings.userId, delivery.userId),
    }),
  ]);
  if (
    !user ||
    user.status !== "active" ||
    !user.emailVerifiedAt ||
    !setting?.enabled
  ) {
    await completeWithoutSending(delivery.id, "skipped", now);
    return "skipped";
  }

  let message: {
    to: string;
    subject: string;
    text: string;
    html: string;
    headers: Record<string, string>;
  };
  if (
    delivery.recipientEmail &&
    delivery.emailSubject &&
    delivery.emailText &&
    delivery.emailHtml
  ) {
    // An account email change must never redirect a prepared message to the old
    // address. Stop this slot rather than changing an idempotent request body.
    if (delivery.recipientEmail !== user.email) {
      await completeWithoutSending(delivery.id, "skipped", now);
      return "skipped";
    }
    const headers = renderNotificationDigestEmail({
      userId: delivery.userId,
      items: [],
      linkCreatedAt: delivery.createdAt,
    }).headers;
    message = {
      to: delivery.recipientEmail,
      subject: delivery.emailSubject,
      text: delivery.emailText,
      html: delivery.emailHtml,
      headers,
    };
  } else {
    const digestItems = await listDeliveryItems(delivery.userId, delivery.id);
    if (digestItems.length === 0) {
      await completeWithoutSending(delivery.id, "skipped", now);
      return "skipped";
    }
    const prepared = renderNotificationDigestEmail({
      userId: delivery.userId,
      items: digestItems,
      linkCreatedAt: delivery.createdAt,
    });
    message = { to: user.email, ...prepared };
    await db
      .update(notificationDigestDeliveries)
      .set({
        recipientEmail: message.to,
        emailSubject: message.subject,
        emailText: message.text,
        emailHtml: message.html,
        preparedAt: now,
      })
      .where(
        and(
          eq(notificationDigestDeliveries.id, delivery.id),
          eq(notificationDigestDeliveries.status, "processing"),
          isNull(notificationDigestDeliveries.preparedAt),
        ),
      );
  }
  try {
    const result = await sendEmailMessage({
      ...message,
      idempotencyKey: `rssapp-notification-digest-${delivery.id}`,
    });
    await db.transaction(async (tx) => {
      await tx
        .update(notificationDigestDeliveries)
        .set({
          status: "sent",
          completedAt: now,
          startedAt: null,
          lastError: null,
          providerMessageId: result.providerMessageId,
        })
        .where(eq(notificationDigestDeliveries.id, delivery.id));
      await tx
        .update(notificationDigestSettings)
        .set({ lastSentAt: now, updatedAt: now })
        .where(eq(notificationDigestSettings.userId, delivery.userId));
    });
    return "sent";
  } catch (error) {
    const message =
      error instanceof EmailDeliveryError
        ? error.message
        : "Unexpected email delivery failure.";
    const retryable = !(error instanceof EmailDeliveryError) || error.retryable;
    if (!retryable || delivery.attemptCount >= MAX_ATTEMPTS) {
      await completeWithoutSending(
        delivery.id,
        "failed",
        now,
        message.slice(0, 500),
      );
      return "failed";
    }
    const backoffMinutes = Math.min(
      6 * 60,
      5 * 2 ** Math.max(0, delivery.attemptCount - 1),
    );
    await db
      .update(notificationDigestDeliveries)
      .set({
        status: "retrying",
        startedAt: null,
        lastError: message.slice(0, 500),
        nextAttemptAt: new Date(now.getTime() + backoffMinutes * 60_000),
      })
      .where(
        and(
          eq(notificationDigestDeliveries.id, delivery.id),
          ne(notificationDigestDeliveries.status, "sent"),
        ),
      );
    return "retrying";
  }
}

export interface NotificationDigestSweepSummary {
  created: number;
  claimed: number;
  sent: number;
  skipped: number;
  retrying: number;
  failed: number;
}

export async function sweepNotificationDigests(
  now = new Date(),
): Promise<NotificationDigestSweepSummary> {
  const created = await createDueDeliveries(now);
  const claimed = await claimDeliveries(now);
  const results = await Promise.all(
    claimed.map((delivery) => deliverClaimed(delivery, now)),
  );
  return {
    created,
    claimed: claimed.length,
    sent: results.filter((result) => result === "sent").length,
    skipped: results.filter((result) => result === "skipped").length,
    retrying: results.filter((result) => result === "retrying").length,
    failed: results.filter((result) => result === "failed").length,
  };
}

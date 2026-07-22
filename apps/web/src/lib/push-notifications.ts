import { and, eq, inArray, sql } from "drizzle-orm";
import { sendNotification } from "web-push";
import { db } from "@/db";
import {
  feeds,
  items,
  notifications,
  pushSubscriptions,
  subscriptions,
} from "@/db/schema";

export interface PushSubscriptionInput {
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
}

interface VapidConfiguration {
  subject: string;
  publicKey: string;
  privateKey: string;
}

interface RuleMatchNotification {
  id: number;
  userId: number;
  itemId: number;
}

const PUSH_TIMEOUT_MS = 10_000;
const PUSH_TTL_SECONDS = 10 * 60;

function hasText(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.length <= maxLength
  );
}

function isVapidSubject(value: string): boolean {
  if (value.startsWith("mailto:"))
    return value.slice("mailto:".length).includes("@");
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}

/** The browser only receives this public key when the deployment can send. */
export function getVapidPublicKey(): string | null {
  const config = getVapidConfiguration();
  return config?.publicKey ?? null;
}

function getVapidConfiguration(): VapidConfiguration | null {
  const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
  const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
  const subject = process.env.VAPID_SUBJECT?.trim();
  if (!publicKey || !privateKey || !subject || !isVapidSubject(subject)) {
    return null;
  }
  return { subject, publicKey, privateKey };
}

/** Reject malformed subscription data before it becomes stored account data. */
export function parsePushSubscription(
  input: unknown,
): PushSubscriptionInput | null {
  if (!input || typeof input !== "object") return null;
  const candidate = input as {
    endpoint?: unknown;
    keys?: { p256dh?: unknown; auth?: unknown };
  };
  if (
    !hasText(candidate.endpoint, 2_048) ||
    !hasText(candidate.keys?.p256dh, 512) ||
    !hasText(candidate.keys?.auth, 512)
  ) {
    return null;
  }
  try {
    if (new URL(candidate.endpoint).protocol !== "https:") return null;
  } catch {
    return null;
  }
  return {
    endpoint: candidate.endpoint,
    keys: { p256dh: candidate.keys.p256dh, auth: candidate.keys.auth },
  };
}

export async function savePushSubscription(
  userId: number,
  subscription: PushSubscriptionInput,
): Promise<void> {
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: subscription.endpoint,
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
      },
    });
}

export async function removePushSubscription(
  userId: number,
  endpoint: string,
): Promise<void> {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint),
      ),
    );
}

type NotificationPushPayload = {
  title: string;
  body: string;
  tag: string;
  url: string;
};

function payloadForMatches(
  matches: Array<{
    id: number;
    source: string | null;
    title: string | null;
  }>,
): NotificationPushPayload {
  const [first] = matches;
  if (matches.length === 1) {
    return {
      title: first.source ?? "rssapp",
      body: first.title ?? "A new article matched one of your rules.",
      tag: `rssapp-rule-${first.id}`,
      url: `/?view=notifications&notification=${first.id}`,
    };
  }
  const sharedSource = matches.every((match) => match.source === first.source)
    ? first.source
    : null;
  return {
    title: "rssapp",
    body: `${matches.length} articles matched your rules${sharedSource ? ` in ${sharedSource}` : ""}.`,
    tag: `rssapp-rule-batch-${matches.at(-1)?.id ?? first.id}`,
    url: "/?view=notifications",
  };
}

function hasExpiredPushEndpoint(error: unknown): boolean {
  if (!error || typeof error !== "object" || !("statusCode" in error)) {
    return false;
  }
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return statusCode === 404 || statusCode === 410;
}

/**
 * Fan out newly persisted rule matches to opted-in devices. The inbox remains
 * canonical: a temporary push failure never discards its notification.
 */
export async function deliverRuleMatchPushNotifications(
  createdNotifications: RuleMatchNotification[],
): Promise<void> {
  const config = getVapidConfiguration();
  if (!config || createdNotifications.length === 0) return;

  const createdIds = createdNotifications.map(
    (notification) => notification.id,
  );
  const matches = await db
    .select({
      id: notifications.id,
      userId: notifications.userId,
      title: items.title,
      source: sql<
        string | null
      >`coalesce(${subscriptions.customTitle}, ${feeds.title})`,
    })
    .from(notifications)
    .innerJoin(items, eq(items.id, notifications.itemId))
    .innerJoin(feeds, eq(feeds.id, items.feedId))
    .innerJoin(
      subscriptions,
      and(
        eq(subscriptions.userId, notifications.userId),
        eq(subscriptions.feedId, items.feedId),
      ),
    )
    .where(inArray(notifications.id, createdIds));
  if (matches.length === 0) return;

  const userIds = [...new Set(matches.map((match) => match.userId))];
  const deviceSubscriptions = await db
    .select({
      endpoint: pushSubscriptions.endpoint,
      userId: pushSubscriptions.userId,
      p256dh: pushSubscriptions.p256dh,
      auth: pushSubscriptions.auth,
    })
    .from(pushSubscriptions)
    .where(inArray(pushSubscriptions.userId, userIds));
  if (deviceSubscriptions.length === 0) return;

  const matchesByUser = new Map<
    number,
    Array<{ id: number; source: string | null; title: string | null }>
  >();
  for (const match of matches) {
    const list = matchesByUser.get(match.userId) ?? [];
    list.push(match);
    matchesByUser.set(match.userId, list);
  }

  const deliveries = deviceSubscriptions.map(async (subscription) => {
    const userMatches = matchesByUser.get(subscription.userId);
    if (!userMatches)
      return { endpoint: subscription.endpoint, expired: false };
    try {
      await sendNotification(
        {
          endpoint: subscription.endpoint,
          keys: { p256dh: subscription.p256dh, auth: subscription.auth },
        },
        JSON.stringify(payloadForMatches(userMatches)),
        {
          vapidDetails: config,
          TTL: PUSH_TTL_SECONDS,
          timeout: PUSH_TIMEOUT_MS,
          urgency: "high",
        },
      );
      return { endpoint: subscription.endpoint, expired: false };
    } catch (error) {
      return {
        endpoint: subscription.endpoint,
        expired: hasExpiredPushEndpoint(error),
      };
    }
  });
  const results = await Promise.all(deliveries);
  const expiredEndpoints = results
    .filter((result) => result.expired)
    .map((result) => result.endpoint);
  if (expiredEndpoints.length > 0) {
    await db
      .delete(pushSubscriptions)
      .where(inArray(pushSubscriptions.endpoint, expiredEndpoints));
  }
}

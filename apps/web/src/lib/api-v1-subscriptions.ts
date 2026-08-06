import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { feeds, subscriptions } from "@/db/schema";
import { type ApiSubscription, getApiSubscriptionByFeed } from "@/lib/api-v1";
import {
  addFeedForUser,
  discoverFeedCandidates,
  type FeedAlternate,
} from "@/lib/feeds";

export interface ApiFeedCandidate {
  url: string;
  title: string | null;
}

/**
 * What `POST /subscriptions` did with a pasted URL.
 *
 * `subscribed` and `candidates` are both successful outcomes — the second one
 * asks a question rather than reporting a failure — while the other two are the
 * two ways a URL can fail to become a subscription, kept apart because a client
 * says something different for each.
 */
export type ApiSubscribeResult =
  | { status: "subscribed"; subscription: ApiSubscription }
  | { status: "candidates"; candidates: ApiFeedCandidate[] }
  | { status: "alreadySubscribed" }
  | { status: "notFound"; message: string };

function candidate(alternate: FeedAlternate): ApiFeedCandidate {
  return { url: alternate.url, title: alternate.title };
}

/** The feed row for an exact URL, when this account already follows it. */
async function subscribedFeedId(
  userId: number,
  feedUrl: string,
): Promise<number | null> {
  const [row] = await db
    .select({ feedId: feeds.id })
    .from(subscriptions)
    .innerJoin(feeds, eq(feeds.id, subscriptions.feedId))
    .where(and(eq(subscriptions.userId, userId), eq(feeds.url, feedUrl)))
    .limit(1);
  return row?.feedId ?? null;
}

/**
 * Turn a pasted site or feed URL into a subscription, or into the question that
 * has to be answered first.
 *
 * Discovery and ingest are the web's, unchanged: `discoverFeedCandidates` does
 * the fetching through the guarded path and `addFeedForUser` does the parse,
 * the initial backfill, and the subscription row. The one thing this adds is
 * the branch the web does not have — a page advertising several feeds returns
 * them instead of silently taking the first, because a native client can ask.
 *
 * Already-subscribed is checked after resolution rather than before, since a
 * site URL and its feed URL are different strings and only the resolved one can
 * be compared against what the account already follows.
 */
export async function createApiSubscription(
  userId: number,
  url: string,
): Promise<ApiSubscribeResult> {
  const discovery = await discoverFeedCandidates(url);
  if (discovery.status === "none") {
    return { status: "notFound", message: discovery.error };
  }
  if (discovery.status === "candidates") {
    return {
      status: "candidates",
      candidates: discovery.candidates.map(candidate),
    };
  }

  if ((await subscribedFeedId(userId, discovery.feedUrl)) !== null) {
    return { status: "alreadySubscribed" };
  }

  let feedId: number;
  try {
    ({ feedId } = await addFeedForUser(userId, discovery.feedUrl));
  } catch (err) {
    return {
      status: "notFound",
      message: err instanceof Error ? err.message : "Could not add that feed.",
    };
  }

  const subscription = await getApiSubscriptionByFeed(userId, feedId);
  if (!subscription) {
    return { status: "notFound", message: "Could not add that feed." };
  }
  return { status: "subscribed", subscription };
}

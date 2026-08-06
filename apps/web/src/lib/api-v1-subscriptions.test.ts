import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ApiSubscription } from "@/lib/api-v1";

const mocks = vi.hoisted(() => ({
  addFeedForUser: vi.fn(),
  discoverFeedCandidates: vi.fn(),
  getApiSubscriptionByFeed: vi.fn(),
  subscribedFeedId: vi.fn(),
}));

vi.mock("@/lib/feeds", () => ({
  addFeedForUser: mocks.addFeedForUser,
  discoverFeedCandidates: mocks.discoverFeedCandidates,
}));
vi.mock("@/lib/api-v1", () => ({
  getApiSubscriptionByFeed: mocks.getApiSubscriptionByFeed,
}));
// The ownership probe is a single select; stubbing the db keeps this focused on
// the branch table rather than on Drizzle's builder.
vi.mock("@/db", () => ({
  db: {
    select: () => ({
      from: () => ({
        innerJoin: () => ({
          where: () => ({
            limit: async () => mocks.subscribedFeedId(),
          }),
        }),
      }),
    }),
  },
}));

import { createApiSubscription } from "@/lib/api-v1-subscriptions";

const subscription: ApiSubscription = {
  id: "7",
  title: "Example Source",
  feed: {
    id: "3",
    url: "https://example.com/feed.xml",
    siteUrl: "https://example.com",
  },
  folder: null,
  unreadCount: 25,
  paused: false,
};

describe("createApiSubscription", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.subscribedFeedId.mockResolvedValue([]);
  });

  it("subscribes to a resolved feed and returns it in the list shape", async () => {
    mocks.discoverFeedCandidates.mockResolvedValue({
      status: "feed",
      feedUrl: "https://example.com/feed.xml",
    });
    mocks.addFeedForUser.mockResolvedValue({
      feedId: 3,
      title: "Example Source",
      itemsAdded: 25,
    });
    mocks.getApiSubscriptionByFeed.mockResolvedValue(subscription);

    await expect(
      createApiSubscription(7, "https://example.com"),
    ).resolves.toEqual({ status: "subscribed", subscription });
    expect(mocks.addFeedForUser).toHaveBeenCalledWith(
      7,
      "https://example.com/feed.xml",
    );
  });

  it("hands back the candidates instead of picking one", async () => {
    mocks.discoverFeedCandidates.mockResolvedValue({
      status: "candidates",
      candidates: [
        { url: "https://example.com/feed.xml", title: "Posts" },
        { url: "https://example.com/comments/feed.xml", title: null },
      ],
    });

    await expect(
      createApiSubscription(7, "https://example.com"),
    ).resolves.toEqual({
      status: "candidates",
      candidates: [
        { url: "https://example.com/feed.xml", title: "Posts" },
        { url: "https://example.com/comments/feed.xml", title: null },
      ],
    });
    expect(mocks.addFeedForUser).not.toHaveBeenCalled();
  });

  it("reports an existing subscription instead of re-ingesting the feed", async () => {
    mocks.discoverFeedCandidates.mockResolvedValue({
      status: "feed",
      feedUrl: "https://example.com/feed.xml",
    });
    mocks.subscribedFeedId.mockResolvedValue([{ feedId: 3 }]);

    await expect(
      createApiSubscription(7, "https://example.com/feed.xml"),
    ).resolves.toEqual({ status: "alreadySubscribed" });
    expect(mocks.addFeedForUser).not.toHaveBeenCalled();
  });

  it("passes a dead end's reason through", async () => {
    mocks.discoverFeedCandidates.mockResolvedValue({
      status: "none",
      error: "No feed found at that address.",
    });

    await expect(
      createApiSubscription(7, "https://example.com"),
    ).resolves.toEqual({
      status: "notFound",
      message: "No feed found at that address.",
    });
  });

  it("does not surface an ingest throw as a server fault", async () => {
    mocks.discoverFeedCandidates.mockResolvedValue({
      status: "feed",
      feedUrl: "https://example.com/feed.xml",
    });
    mocks.addFeedForUser.mockRejectedValue(new Error("Parse failed: bad XML"));

    await expect(
      createApiSubscription(7, "https://example.com"),
    ).resolves.toEqual({
      status: "notFound",
      message: "Parse failed: bad XML",
    });
  });
});

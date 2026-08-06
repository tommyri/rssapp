import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  createSubscription: vi.fn(),
  listSubscriptions: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  listApiSubscriptions: mocks.listSubscriptions,
}));
vi.mock("@/lib/api-v1-subscriptions", () => ({
  createApiSubscription: mocks.createSubscription,
}));

import { GET, POST } from "./route";

const subscription = {
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

function subscribe(body: unknown): Promise<Response> {
  return POST(
    new Request("https://currentfold.test/api/v1/subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET /api/v1/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("lists the account's subscriptions", async () => {
    mocks.listSubscriptions.mockResolvedValue([subscription]);

    const response = await GET(
      new Request("https://currentfold.test/api/v1/subscriptions"),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ data: [subscription] });
  });
});

describe("POST /api/v1/subscriptions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("returns the created subscription in the list shape", async () => {
    mocks.createSubscription.mockResolvedValue({
      status: "subscribed",
      subscription,
    });

    const response = await subscribe({ url: "https://example.com" });

    expect(response.status).toBe(201);
    expect(mocks.createSubscription).toHaveBeenCalledWith(
      7,
      "https://example.com",
    );
    expect(await response.json()).toEqual({
      data: { status: "subscribed", subscription },
    });
  });

  it("returns the candidates without subscribing when a page advertises several", async () => {
    const candidates = [
      { url: "https://example.com/feed.xml", title: "Posts" },
      { url: "https://example.com/comments/feed.xml", title: null },
    ];
    mocks.createSubscription.mockResolvedValue({
      status: "candidates",
      candidates,
    });

    const response = await subscribe({ url: "https://example.com" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { status: "candidates", candidates },
    });
  });

  it("reports a source the account already follows", async () => {
    mocks.createSubscription.mockResolvedValue({ status: "alreadySubscribed" });

    const response = await subscribe({ url: "https://example.com/feed.xml" });

    expect(response.status).toBe(409);
    expect(await response.json()).toMatchObject({
      error: { code: "already_subscribed" },
    });
  });

  it("reports a URL with no feed behind it, with the reason", async () => {
    mocks.createSubscription.mockResolvedValue({
      status: "notFound",
      message: "No feed found at that address.",
    });

    const response = await subscribe({ url: "https://example.com" });

    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({
      error: {
        code: "feed_not_found",
        message: "No feed found at that address.",
      },
    });
  });

  it("rejects a malformed body before fetching anything", async () => {
    const response = await subscribe({ feedUrl: "https://example.com" });

    expect(response.status).toBe(400);
    expect(mocks.createSubscription).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });

  it("refuses an unauthenticated subscribe", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await subscribe({ url: "https://example.com" });

    expect(response.status).toBe(401);
    expect(mocks.createSubscription).not.toHaveBeenCalled();
  });
});

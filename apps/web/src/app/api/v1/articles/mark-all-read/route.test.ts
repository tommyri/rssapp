import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  markRead: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  markApiArticlesRead: mocks.markRead,
}));

import { POST } from "./route";

function markAllRead(body: unknown): Promise<Response> {
  return POST(
    new Request("https://currentfold.test/api/v1/articles/mark-all-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/v1/articles/mark-all-read", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("sweeps an account-wide scope and reports what changed", async () => {
    mocks.markRead.mockResolvedValue(31);
    const response = await markAllRead({ scope: "all" });

    expect(response.status).toBe(200);
    expect(mocks.markRead).toHaveBeenCalledWith(7, {
      scope: "all",
      subscriptionId: null,
      folderId: null,
      olderThan: null,
    });
    expect(await response.json()).toEqual({
      data: {
        scope: "all",
        subscriptionId: null,
        folderId: null,
        olderThan: null,
        markedCount: 31,
      },
    });
  });

  it("sweeps one subscription up to a cutoff", async () => {
    mocks.markRead.mockResolvedValue(4);
    const response = await markAllRead({
      scope: "subscription",
      subscriptionId: "9",
      olderThan: "2026-07-22T12:00:00.000Z",
    });

    expect(response.status).toBe(200);
    expect(mocks.markRead).toHaveBeenCalledWith(7, {
      scope: "subscription",
      subscriptionId: 9,
      folderId: null,
      olderThan: new Date("2026-07-22T12:00:00.000Z"),
    });
    expect(await response.json()).toEqual({
      data: {
        scope: "subscription",
        subscriptionId: "9",
        folderId: null,
        olderThan: "2026-07-22T12:00:00.000Z",
        markedCount: 4,
      },
    });
  });

  it("sweeps a folder", async () => {
    mocks.markRead.mockResolvedValue(0);
    const response = await markAllRead({ scope: "folder", folderId: "3" });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        scope: "folder",
        subscriptionId: null,
        folderId: "3",
        olderThan: null,
        markedCount: 0,
      },
    });
  });

  it("will not sweep without an explicit scope", async () => {
    const response = await markAllRead({ olderThan: "2026-07-22T12:00:00Z" });

    expect(response.status).toBe(400);
    expect(mocks.markRead).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });

  it("reports a scope that is not this account's rather than claiming success", async () => {
    mocks.markRead.mockResolvedValue(null);
    const response = await markAllRead({ scope: "folder", folderId: "3" });

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({
      error: {
        code: "scope_not_found",
        message: "That folder is not available to this account.",
      },
    });
  });

  it("refuses an unauthenticated sweep", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const response = await markAllRead({ scope: "all" });

    expect(response.status).toBe(401);
    expect(mocks.markRead).not.toHaveBeenCalled();
  });
});

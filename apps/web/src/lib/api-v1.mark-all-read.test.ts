import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  select: vi.fn(),
  markAllRead: vi.fn(),
}));

vi.mock("@/db", () => ({ db: { select: mocks.select } }));
vi.mock("@/lib/reader", () => ({ markAllRead: mocks.markAllRead }));

import { markApiArticlesRead } from "@/lib/api-v1";

/** Queue one row set per ownership lookup, in call order. */
function ownershipLookups(...rowSets: unknown[][]): void {
  const queued = [...rowSets];
  mocks.select.mockImplementation(() => ({
    from: () => ({
      where: () => ({ limit: () => Promise.resolve(queued.shift() ?? []) }),
    }),
  }));
}

describe("markApiArticlesRead", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.markAllRead.mockResolvedValue(0);
  });

  it("sweeps every subscription when the scope is the whole account", async () => {
    ownershipLookups();
    mocks.markAllRead.mockResolvedValue(31);

    const marked = await markApiArticlesRead(7, {
      scope: "all",
      subscriptionId: null,
      folderId: null,
      olderThan: null,
    });

    expect(marked).toBe(31);
    // An empty view is the reader's "everything" view; no cutoff means no bound.
    expect(mocks.markAllRead).toHaveBeenCalledWith(7, {}, undefined);
    expect(mocks.select).not.toHaveBeenCalled();
  });

  it("resolves a subscription to the feed the reader's views are keyed by", async () => {
    ownershipLookups([{ feedId: 55 }]);

    await markApiArticlesRead(7, {
      scope: "subscription",
      subscriptionId: 9,
      folderId: null,
      olderThan: null,
    });

    expect(mocks.markAllRead).toHaveBeenCalledWith(
      7,
      { feedId: 55 },
      undefined,
    );
  });

  it("passes an olderThan cutoff through as the sweep's bound", async () => {
    ownershipLookups([{ feedId: 55 }]);
    const cutoff = new Date("2026-07-22T12:00:00.000Z");

    await markApiArticlesRead(7, {
      scope: "subscription",
      subscriptionId: 9,
      folderId: null,
      olderThan: cutoff,
    });

    expect(mocks.markAllRead).toHaveBeenCalledWith(7, { feedId: 55 }, cutoff);
  });

  it("sweeps a folder by id", async () => {
    ownershipLookups([{ id: 3 }]);

    await markApiArticlesRead(7, {
      scope: "folder",
      subscriptionId: null,
      folderId: 3,
      olderThan: null,
    });

    expect(mocks.markAllRead).toHaveBeenCalledWith(
      7,
      { folderId: 3 },
      undefined,
    );
  });

  it("refuses a subscription that is not this account's without writing", async () => {
    ownershipLookups([]);

    expect(
      await markApiArticlesRead(7, {
        scope: "subscription",
        subscriptionId: 9,
        folderId: null,
        olderThan: null,
      }),
    ).toBeNull();
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });

  it("refuses a folder that is not this account's without writing", async () => {
    ownershipLookups([]);

    expect(
      await markApiArticlesRead(7, {
        scope: "folder",
        subscriptionId: null,
        folderId: 3,
        olderThan: null,
      }),
    ).toBeNull();
    expect(mocks.markAllRead).not.toHaveBeenCalled();
  });
});

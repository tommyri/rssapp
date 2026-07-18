import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  notificationConflict: vi.fn(),
  notificationValues: vi.fn(),
  select: vi.fn(),
  transaction: vi.fn(),
  txInsert: vi.fn(),
}));

vi.mock("@/db", () => ({
  db: {
    select: mocks.select,
    transaction: mocks.transaction,
  },
}));

import { applyRuleToExistingItems } from "./apply";

const matchingItem = {
  id: 91,
  title: "Kubernetes operator notes",
  author: "Jane Doe",
  contentHtml: "<p>Notes</p>",
};

const notificationRule = {
  id: 27,
  feedId: null,
  field: "title" as const,
  matchType: "contains" as const,
  pattern: "kubernetes",
  action: "notify" as const,
  labelId: null,
};

function existingItemQuery() {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    limit: vi.fn(),
    orderBy: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockReturnValue(query);
  query.orderBy.mockReturnValue(query);
  query.limit.mockResolvedValue([matchingItem]);
  return query;
}

describe("applyRuleToExistingItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(existingItemQuery());
    mocks.notificationConflict.mockResolvedValue(undefined);
    mocks.notificationValues.mockReturnValue({
      onConflictDoNothing: mocks.notificationConflict,
    });
    mocks.txInsert.mockReturnValue({ values: mocks.notificationValues });
    mocks.transaction.mockImplementation(async (callback) =>
      callback({ insert: mocks.txInsert }),
    );
  });

  it("adds inbox notifications when a notify rule is explicitly applied to existing matches", async () => {
    await expect(
      applyRuleToExistingItems(4, notificationRule, true),
    ).resolves.toMatchObject({ scanned: 1, matched: 1, hasMore: false });

    expect(mocks.txInsert).toHaveBeenCalledOnce();
    expect(mocks.notificationValues).toHaveBeenCalledWith([
      {
        userId: 4,
        itemId: 91,
        ruleId: 27,
        ruleField: "title",
        ruleMatchType: "contains",
        rulePattern: "kubernetes",
      },
    ]);
  });

  it("respects the reader's disabled in-app notifications preference", async () => {
    await expect(
      applyRuleToExistingItems(4, notificationRule, false),
    ).resolves.toMatchObject({ scanned: 1, matched: 1, hasMore: false });

    expect(mocks.txInsert).not.toHaveBeenCalled();
  });
});

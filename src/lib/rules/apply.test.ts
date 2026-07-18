import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  deliverRuleMatchPushNotifications: vi.fn(),
  notificationConflict: vi.fn(),
  notificationReturning: vi.fn(),
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

vi.mock("@/lib/push-notifications", () => ({
  deliverRuleMatchPushNotifications: mocks.deliverRuleMatchPushNotifications,
}));

import { applyRulesToNewItems, applyRuleToExistingItems } from "./apply";

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

function newItemRuleQuery() {
  const query = {
    from: vi.fn(),
    innerJoin: vi.fn(),
    where: vi.fn(),
  };
  query.from.mockReturnValue(query);
  query.innerJoin.mockReturnValue(query);
  query.where.mockResolvedValue([
    {
      id: notificationRule.id,
      userId: 4,
      field: notificationRule.field,
      matchType: notificationRule.matchType,
      pattern: notificationRule.pattern,
      action: notificationRule.action,
      labelId: null,
      notificationsEnabled: true,
    },
  ]);
  return query;
}

describe("applyRuleToExistingItems", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.select.mockReturnValue(existingItemQuery());
    mocks.notificationConflict.mockImplementation(() =>
      Object.assign(Promise.resolve(undefined), {
        returning: mocks.notificationReturning,
      }),
    );
    mocks.notificationReturning.mockResolvedValue([
      { id: 101, userId: 4, itemId: 91 },
    ]);
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

  it("delivers only newly persisted notifications from the ingestion path", async () => {
    mocks.select.mockReturnValue(newItemRuleQuery());

    await applyRulesToNewItems(7, [matchingItem]);

    expect(mocks.notificationReturning).toHaveBeenCalledWith({
      id: expect.anything(),
      userId: expect.anything(),
      itemId: expect.anything(),
    });
    expect(mocks.deliverRuleMatchPushNotifications).toHaveBeenCalledWith([
      { id: 101, userId: 4, itemId: 91 },
    ]);
  });
});

import { and } from "drizzle-orm";
import { PgDialect } from "drizzle-orm/pg-core";
import { describe, expect, it } from "vitest";
import type { ApiArticleQuery } from "@/lib/api-v1";
import { apiArticleStreamConditions } from "@/lib/api-v1";

const dialect = new PgDialect();

function whereClause(query: Partial<ApiArticleQuery> = {}): string {
  const conditions = apiArticleStreamConditions(7, {
    limit: 50,
    cursor: null,
    filter: "all",
    subscriptionId: null,
    folderId: null,
    ...query,
  });
  const combined = and(...conditions);
  if (!combined) throw new Error("expected at least one condition");
  return dialect.sqlToQuery(combined).sql;
}

describe("apiArticleStreamConditions", () => {
  it("always scopes to the account's own, non-muted articles", () => {
    const clause = whereClause();

    expect(clause).toContain('"subscriptions"."user_id" = $1');
    expect(clause).toContain('"item_states"."muted" is not true');
  });

  it("treats unread as the absence of a read state, not read = false", () => {
    // item_states rows exist only where state diverges from the default, so an
    // equality test would drop every article nobody has touched (AGENTS.md).
    expect(whereClause({ filter: "unread" })).toContain(
      '"item_states"."read" is not true',
    );
    expect(whereClause({ filter: "unread" })).not.toContain('"read" = ');
  });

  it("filters starred and read-later on their own flags", () => {
    expect(whereClause({ filter: "starred" })).toContain(
      '"item_states"."starred" = $2',
    );
    expect(whereClause({ filter: "readLater" })).toContain(
      '"item_states"."read_later" = $2',
    );
  });

  it("adds nothing for the default stream", () => {
    const clause = whereClause({ filter: "all" });

    expect(clause).not.toContain('"read"');
    expect(clause).not.toContain('"starred"');
    expect(clause).not.toContain('"read_later"');
  });

  it("scopes to a subscription and a folder together", () => {
    const clause = whereClause({ subscriptionId: 9, folderId: 3 });

    expect(clause).toContain('"subscriptions"."id" = $2');
    expect(clause).toContain('"subscriptions"."folder_id" = $3');
  });

  it("paginates a filtered stream on the indexed sort expression", () => {
    const clause = whereClause({
      filter: "unread",
      subscriptionId: 9,
      cursor: { sortAt: new Date("2026-07-22T12:00:00.000Z"), articleId: 42 },
    });

    // The keyset predicate must name coalesce(published_at, created_at) — the
    // expression items_feed_sort_idx covers — and must AND with the filters
    // rather than replace them.
    expect(clause).toContain(
      'coalesce("items"."published_at", "items"."created_at"), "items"."id")',
    );
    expect(clause).toContain('"item_states"."read" is not true');
    expect(clause).toContain('"subscriptions"."id" = $2');
  });
});

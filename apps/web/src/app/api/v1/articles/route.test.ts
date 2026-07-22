import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listArticles: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({ listApiArticles: mocks.listArticles }));

import { GET } from "./route";

describe("GET /api/v1/articles", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("passes bounded stream filters into the reader query", async () => {
    mocks.listArticles.mockResolvedValue({
      data: [],
      pagination: { nextCursor: null },
    });
    const response = await GET(
      new Request(
        "https://currentfold.test/api/v1/articles?limit=25&unreadOnly=true&subscriptionId=9",
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.listArticles).toHaveBeenCalledWith(7, {
      limit: 25,
      cursor: null,
      unreadOnly: true,
      subscriptionId: 9,
    });
  });

  it("rejects malformed stream input before querying", async () => {
    const response = await GET(
      new Request("https://currentfold.test/api/v1/articles?limit=500"),
    );

    expect(response.status).toBe(400);
    expect(mocks.listArticles).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_query" },
    });
  });
});

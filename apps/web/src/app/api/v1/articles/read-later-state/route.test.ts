import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setReadLaterState: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  setApiArticleReadLaterState: mocks.setReadLaterState,
}));

import { PATCH } from "./route";

describe("PATCH /api/v1/articles/read-later-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("applies an idempotent read-later batch and returns string IDs", async () => {
    mocks.setReadLaterState.mockResolvedValue([42, 43]);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-later-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: ["42", "43"], readLater: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setReadLaterState).toHaveBeenCalledWith(7, [42, 43], true);
    expect(await response.json()).toEqual({
      data: { articleIds: ["42", "43"], readLater: true },
    });
  });

  it("removes articles from the queue without touching read state", async () => {
    mocks.setReadLaterState.mockResolvedValue([42]);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-later-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], readLater: false }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setReadLaterState).toHaveBeenCalledWith(7, [42], false);
    expect(await response.json()).toEqual({
      data: { articleIds: ["42"], readLater: false },
    });
  });

  it("does not partially update a batch containing an unavailable article", async () => {
    mocks.setReadLaterState.mockResolvedValue(null);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-later-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], readLater: true }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "article_not_found" },
    });
  });

  it("rejects a malformed body before writing", async () => {
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-later-state", {
        method: "PATCH",
        body: "not json",
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.setReadLaterState).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });
});

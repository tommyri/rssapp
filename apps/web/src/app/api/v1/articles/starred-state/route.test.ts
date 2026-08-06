import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setStarredState: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  setApiArticleStarredState: mocks.setStarredState,
}));

import { PATCH } from "./route";

describe("PATCH /api/v1/articles/starred-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("applies an idempotent star batch and returns string IDs", async () => {
    mocks.setStarredState.mockResolvedValue([42, 43]);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/starred-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: ["42", "43"], starred: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setStarredState).toHaveBeenCalledWith(7, [42, 43], true);
    expect(await response.json()).toEqual({
      data: { articleIds: ["42", "43"], starred: true },
    });
  });

  it("does not partially update a batch containing an unavailable article", async () => {
    mocks.setStarredState.mockResolvedValue(null);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/starred-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], starred: false }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "article_not_found" },
    });
  });

  it("rejects a body that names the wrong state before writing", async () => {
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/starred-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], read: true }),
      }),
    );

    expect(response.status).toBe(400);
    expect(mocks.setStarredState).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });

  it("refuses an unauthenticated request", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/starred-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], starred: true }),
      }),
    );

    expect(response.status).toBe(401);
    expect(mocks.setStarredState).not.toHaveBeenCalled();
  });
});

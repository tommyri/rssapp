import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setReadState: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  setApiArticleReadState: mocks.setReadState,
}));

import { PATCH } from "./route";

describe("PATCH /api/v1/articles/read-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("applies an idempotent state batch and returns string IDs", async () => {
    mocks.setReadState.mockResolvedValue([42, 43]);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleIds: ["42", "43"], read: true }),
      }),
    );

    expect(response.status).toBe(200);
    expect(mocks.setReadState).toHaveBeenCalledWith(7, [42, 43], true);
    expect(await response.json()).toEqual({
      data: { articleIds: ["42", "43"], read: true },
    });
  });

  it("does not partially update a batch containing an unavailable article", async () => {
    mocks.setReadState.mockResolvedValue(null);
    const response = await PATCH(
      new Request("https://currentfold.test/api/v1/articles/read-state", {
        method: "PATCH",
        body: JSON.stringify({ articleIds: ["42"], read: false }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "article_not_found" },
    });
  });
});

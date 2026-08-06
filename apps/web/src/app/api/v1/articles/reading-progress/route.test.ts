import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setProgress: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1", () => ({
  setApiArticleReadingProgress: mocks.setProgress,
}));

import { PATCH } from "./route";

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request("https://currentfold.test/api/v1/articles/reading-progress", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("PATCH /api/v1/articles/reading-progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("stores one position, which is the ordinary case", async () => {
    mocks.setProgress.mockResolvedValue([
      { articleId: 42, readingProgress: 0.42 },
    ]);

    const response = await patch({
      positions: [{ articleId: "42", readingProgress: 0.42 }],
    });

    expect(response.status).toBe(200);
    expect(mocks.setProgress).toHaveBeenCalledWith(7, [
      { articleId: 42, readingProgress: 0.42 },
    ]);
    expect(await response.json()).toEqual({
      data: { positions: [{ articleId: "42", readingProgress: 0.42 }] },
    });
  });

  it("reports the stored position, not the submitted one", async () => {
    // A position at the very end is stored as null: resuming there is worse
    // than not resuming. The client has to be told, or it will keep resending.
    mocks.setProgress.mockResolvedValue([
      { articleId: 43, readingProgress: null },
    ]);

    const response = await patch({
      positions: [{ articleId: "43", readingProgress: 0.98 }],
    });

    expect(await response.json()).toEqual({
      data: { positions: [{ articleId: "43", readingProgress: null }] },
    });
  });

  it("does not write a batch containing an unavailable article", async () => {
    mocks.setProgress.mockResolvedValue(null);

    const response = await patch({
      positions: [{ articleId: "42", readingProgress: 0.42 }],
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "article_not_found" },
    });
  });

  it("rejects a position outside 0 to 1", async () => {
    const response = await patch({
      positions: [{ articleId: "42", readingProgress: 42 }],
    });

    expect(response.status).toBe(400);
    expect(mocks.setProgress).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });

  it("rejects a repeated article rather than choosing a position", async () => {
    const response = await patch({
      positions: [
        { articleId: "42", readingProgress: 0.42 },
        { articleId: "42", readingProgress: 0.9 },
      ],
    });

    expect(response.status).toBe(400);
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated write", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await patch({
      positions: [{ articleId: "42", readingProgress: 0.42 }],
    });

    expect(response.status).toBe(401);
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });
});

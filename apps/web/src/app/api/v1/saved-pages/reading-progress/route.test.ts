import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setProgress: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1-saved-pages", () => ({
  setApiSavedPageReadingProgress: mocks.setProgress,
}));

import { PATCH } from "./route";

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request(
      "https://currentfold.test/api/v1/saved-pages/reading-progress",
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
  );
}

describe("PATCH /api/v1/saved-pages/reading-progress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("stores a batch of positions and echoes what was kept", async () => {
    mocks.setProgress.mockResolvedValue([
      { savedPageId: 31, readingProgress: 0.42 },
      { savedPageId: 30, readingProgress: null },
    ]);

    const response = await patch({
      positions: [
        { savedPageId: "31", readingProgress: 0.42 },
        { savedPageId: "30", readingProgress: 0.99 },
      ],
    });

    expect(response.status).toBe(200);
    expect(mocks.setProgress).toHaveBeenCalledWith(7, [
      { savedPageId: 31, readingProgress: 0.42 },
      { savedPageId: 30, readingProgress: 0.99 },
    ]);
    expect(await response.json()).toEqual({
      data: {
        positions: [
          { savedPageId: "31", readingProgress: 0.42 },
          { savedPageId: "30", readingProgress: null },
        ],
      },
    });
  });

  it("does not write a batch containing an unavailable page", async () => {
    mocks.setProgress.mockResolvedValue(null);

    const response = await patch({
      positions: [{ savedPageId: "31", readingProgress: 0.42 }],
    });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "saved_page_not_found" },
    });
  });

  it("rejects a repeated saved page rather than choosing a position", async () => {
    const response = await patch({
      positions: [
        { savedPageId: "31", readingProgress: 0.42 },
        { savedPageId: "31", readingProgress: 0.9 },
      ],
    });

    expect(response.status).toBe(400);
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated write", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await patch({
      positions: [{ savedPageId: "31", readingProgress: 0.42 }],
    });

    expect(response.status).toBe(401);
    expect(mocks.setProgress).not.toHaveBeenCalled();
  });
});

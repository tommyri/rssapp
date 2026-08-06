import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  setReadState: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1-saved-pages", () => ({
  setApiSavedPageReadState: mocks.setReadState,
}));

import { PATCH } from "./route";

function patch(body: unknown): Promise<Response> {
  return PATCH(
    new Request("https://currentfold.test/api/v1/saved-pages/read-state", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("PATCH /api/v1/saved-pages/read-state", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("applies an idempotent batch and returns string IDs", async () => {
    mocks.setReadState.mockResolvedValue([31, 30]);

    const response = await patch({ savedPageIds: ["31", "30"], read: true });

    expect(response.status).toBe(200);
    expect(mocks.setReadState).toHaveBeenCalledWith(7, [31, 30], true);
    expect(await response.json()).toEqual({
      data: { savedPageIds: ["31", "30"], read: true },
    });
  });

  it("marks a saved page unread again", async () => {
    mocks.setReadState.mockResolvedValue([31]);

    const response = await patch({ savedPageIds: ["31"], read: false });

    expect(response.status).toBe(200);
    expect(mocks.setReadState).toHaveBeenCalledWith(7, [31], false);
  });

  it("does not partially update a batch containing an unavailable page", async () => {
    mocks.setReadState.mockResolvedValue(null);

    const response = await patch({ savedPageIds: ["31"], read: true });

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "saved_page_not_found" },
    });
  });

  it("rejects an article batch sent to the saved-page endpoint", async () => {
    const response = await patch({ articleIds: ["42"], read: true });

    expect(response.status).toBe(400);
    expect(mocks.setReadState).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated write", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await patch({ savedPageIds: ["31"], read: true });

    expect(response.status).toBe(401);
    expect(mocks.setReadState).not.toHaveBeenCalled();
  });
});

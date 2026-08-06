import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  removeSavedPage: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1-saved-pages", () => ({
  removeApiSavedPage: mocks.removeSavedPage,
}));

import { DELETE } from "./route";

function remove(id: string): Promise<Response> {
  return DELETE(
    new Request(`https://currentfold.test/api/v1/saved-pages/${id}`, {
      method: "DELETE",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("DELETE /api/v1/saved-pages/{id}", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("removes a saved page and returns no content", async () => {
    mocks.removeSavedPage.mockResolvedValue(true);

    const response = await remove("31");

    expect(response.status).toBe(204);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(mocks.removeSavedPage).toHaveBeenCalledWith(7, 31);
  });

  it("does not reveal another account's page as deletable", async () => {
    mocks.removeSavedPage.mockResolvedValue(false);

    const response = await remove("31");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "saved_page_not_found" },
    });
  });

  it("rejects an id that is not an opaque id", async () => {
    const response = await remove("not-a-page");

    expect(response.status).toBe(400);
    expect(mocks.removeSavedPage).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated delete", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await remove("31");

    expect(response.status).toBe(401);
    expect(mocks.removeSavedPage).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  callbacks: [] as Array<() => Promise<void>>,
  consumeSaveLinkBudget: vi.fn(),
  extractSavedPage: vi.fn(),
  getCurrentUserId: vi.fn(),
  redirect: vi.fn(),
  saveLink: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect: mocks.redirect,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/current-user", () => ({
  getCurrentUserId: mocks.getCurrentUserId,
}));
vi.mock("@/lib/saved-pages", () => ({
  extractSavedPage: mocks.extractSavedPage,
  saveLink: mocks.saveLink,
}));
vi.mock("@/lib/save-link-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/save-link-limit")>()),
  consumeSaveLinkBudget: mocks.consumeSaveLinkBudget,
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

describe("GET /save", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      mocks.callbacks.push(callback);
    });
    mocks.getCurrentUserId.mockResolvedValue(4);
    mocks.consumeSaveLinkBudget.mockResolvedValue(true);
    mocks.extractSavedPage.mockResolvedValue(undefined);
    mocks.redirect.mockImplementation(() => {
      throw new Error("redirect");
    });
  });

  it("redirects immediately and keeps new-page extraction alive afterward", async () => {
    mocks.saveLink.mockResolvedValue({
      ok: true,
      id: 7,
      alreadySaved: false,
    });

    await expect(
      GET(
        new NextRequest(
          "https://reader.test/save?url=https%3A%2F%2Fexample.com%2Farticle",
        ),
      ),
    ).rejects.toThrow("redirect");

    expect(mocks.saveLink).toHaveBeenCalledWith(
      4,
      "https://example.com/article",
    );
    expect(mocks.after).toHaveBeenCalledTimes(1);
    expect(mocks.extractSavedPage).not.toHaveBeenCalled();

    await mocks.callbacks[0]?.();
    expect(mocks.extractSavedPage).toHaveBeenCalledWith(7);
    expect(mocks.redirect).toHaveBeenCalledWith("/?view=later");
  });

  it("spends one save from the account's budget", async () => {
    mocks.saveLink.mockResolvedValue({ ok: true, id: 7, alreadySaved: false });

    await expect(
      GET(
        new NextRequest(
          "https://reader.test/save?url=https%3A%2F%2Fexample.com%2Farticle",
        ),
      ),
    ).rejects.toThrow("redirect");

    expect(mocks.consumeSaveLinkBudget).toHaveBeenCalledWith(4);
  });

  it("fetches nothing once the budget is spent, and says so in the reader", async () => {
    mocks.consumeSaveLinkBudget.mockResolvedValue(false);

    await expect(
      GET(
        new NextRequest(
          "https://reader.test/save?url=https%3A%2F%2Fexample.com%2Farticle",
        ),
      ),
    ).rejects.toThrow("redirect");

    expect(mocks.saveLink).not.toHaveBeenCalled();
    expect(mocks.after).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/?view=later&saved=limited");
  });

  it("does not spend the budget when no url is supplied", async () => {
    await expect(
      GET(new NextRequest("https://reader.test/save")),
    ).rejects.toThrow("redirect");

    expect(mocks.consumeSaveLinkBudget).not.toHaveBeenCalled();
    expect(mocks.redirect).toHaveBeenCalledWith("/?view=later");
  });

  it("does not schedule duplicate extraction for an existing saved page", async () => {
    mocks.saveLink.mockResolvedValue({
      ok: true,
      id: 7,
      alreadySaved: true,
    });

    await expect(
      GET(
        new NextRequest(
          "https://reader.test/save?url=https%3A%2F%2Fexample.com%2Farticle",
        ),
      ),
    ).rejects.toThrow("redirect");

    expect(mocks.after).not.toHaveBeenCalled();
  });
});

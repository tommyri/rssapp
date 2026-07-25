import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SavedPage } from "@/lib/saved-pages";

const mocks = vi.hoisted(() => ({
  getOptionalUserId: vi.fn(),
  getSavedPage: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getOptionalUserId: mocks.getOptionalUserId,
}));
vi.mock("@/lib/feeds/sanitize", () => ({
  normalizeStoredArticleHtml: (html: string | null) => html,
}));
vi.mock("@/lib/saved-pages", () => ({
  getSavedPage: mocks.getSavedPage,
}));

import { GET } from "./route";

const context = (pageId: string) => ({
  params: Promise.resolve({ pageId }),
});

function savedPage(patch: Partial<SavedPage> = {}): SavedPage {
  return {
    id: 7,
    url: "https://example.com/article",
    title: "Saved article",
    byline: "Example author",
    siteName: "Example",
    excerpt: null,
    contentHtml: "<p>Readable article.</p>",
    status: "ready",
    error: null,
    read: false,
    readingProgress: null,
    savedAt: new Date("2026-07-24T12:00:00.000Z"),
    ...patch,
  };
}

describe("GET /api/saved-pages/[pageId]/extraction", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a signed-in reader", async () => {
    mocks.getOptionalUserId.mockResolvedValue(null);

    const response = await GET(
      new Request("https://reader.test"),
      context("7"),
    );

    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(mocks.getSavedPage).not.toHaveBeenCalled();
  });

  it("rejects an invalid page id", async () => {
    mocks.getOptionalUserId.mockResolvedValue(4);

    const response = await GET(
      new Request("https://reader.test"),
      context("not-a-page"),
    );

    expect(response.status).toBe(400);
    expect(mocks.getSavedPage).not.toHaveBeenCalled();
  });

  it("does not expose another reader's missing page", async () => {
    mocks.getOptionalUserId.mockResolvedValue(4);
    mocks.getSavedPage.mockResolvedValue(null);

    const response = await GET(
      new Request("https://reader.test"),
      context("7"),
    );

    expect(response.status).toBe(404);
    expect(mocks.getSavedPage).toHaveBeenCalledWith(4, 7);
  });

  it("returns the normalized terminal reader snapshot without caching", async () => {
    mocks.getOptionalUserId.mockResolvedValue(4);
    mocks.getSavedPage.mockResolvedValue(savedPage());

    const response = await GET(
      new Request("https://reader.test"),
      context("7"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    await expect(response.json()).resolves.toEqual({
      id: 7,
      status: "ready",
      error: null,
      title: "Saved article",
      author: "Example author",
      feedTitle: "Example",
      contentHtml: "<p>Readable article.</p>",
    });
  });
});

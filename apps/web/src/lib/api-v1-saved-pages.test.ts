import savedPagePage from "@currentfold/api-contract/fixtures/saved-page-page.json";
import savedPageResponse from "@currentfold/api-contract/fixtures/saved-page-response.json";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { apiArticleSummary } from "@/lib/api-v1-article-summary";
import type { SavedPage } from "@/lib/saved-pages";

const mocks = vi.hoisted(() => ({
  extractSavedPage: vi.fn(),
  getSavedPage: vi.fn(),
  listSavedPagePage: vi.fn(),
  removeSavedPage: vi.fn(),
  retrySavedPage: vi.fn(),
  saveLink: vi.fn(),
  setSavedPagesRead: vi.fn(),
  setSavedPagesReadingProgress: vi.fn(),
}));

vi.mock("@/lib/saved-pages", () => mocks);
vi.mock("@/lib/feeds", () => ({
  normalizeStoredArticleHtml: (html: string | null) => html,
}));

import {
  apiSavedPage,
  createApiSavedPage,
  listApiSavedPages,
  retryApiSavedPage,
  setApiSavedPageReadingProgress,
} from "@/lib/api-v1-saved-pages";

function savedPage(patch: Partial<SavedPage> = {}): SavedPage {
  return {
    id: 31,
    url: "https://example.org/essays/the-quiet-web",
    title: "The quiet web",
    byline: "Example Author",
    siteName: "Example Essays",
    excerpt: null,
    contentHtml: "<p>A saved page reads exactly like a feed article.</p>",
    status: "ready",
    error: null,
    read: false,
    readingProgress: 0.42,
    savedAt: new Date("2026-07-24T09:15:00.000Z"),
    ...patch,
  };
}

describe("apiSavedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("projects a ready page with the row facts an article row carries", () => {
    expect(apiSavedPage(savedPage())).toEqual({
      id: "31",
      url: "https://example.org/essays/the-quiet-web",
      title: "The quiet web",
      siteName: "Example Essays",
      author: "Example Author",
      savedAt: "2026-07-24T09:15:00.000Z",
      extraction: { status: "ready", error: null },
      content: {
        html: "<p>A saved page reads exactly like a feed article.</p>",
      },
      preview: "A saved page reads exactly like a feed article.",
      readingTime: null,
      state: { read: false, readingProgress: 0.42 },
    });
  });

  it("names the source by host when extraction found no site name", () => {
    const page = apiSavedPage(
      savedPage({ siteName: null, url: "https://www.example.net/long-read" }),
    );
    expect(page.siteName).toBe("example.net");
  });

  it("falls back to the URL for a page that has no title yet", () => {
    const page = apiSavedPage(
      savedPage({ title: null, status: "pending", contentHtml: null }),
    );
    expect(page.title).toBe("https://example.org/essays/the-quiet-web");
    expect(page.preview).toBeNull();
    expect(page.readingTime).toBeNull();
  });

  it("reports a terminal failure as failed and carries its reason", () => {
    const page = apiSavedPage(
      savedPage({
        status: "error",
        error: "Could not fetch page: HTTP 403 Forbidden",
        contentHtml: null,
      }),
    );
    expect(page.extraction).toEqual({
      status: "failed",
      error: "Could not fetch page: HTTP 403 Forbidden",
    });
  });

  it("agrees with the published saved-page fixtures", () => {
    // These are what a native client decodes in its own tests, so their row
    // facts have to be what this server would actually have sent.
    const pages = [...savedPagePage.data, savedPageResponse.data.savedPage];
    for (const page of pages) {
      expect(apiArticleSummary(page.content.html, page.title)).toEqual({
        preview: page.preview,
        readingTime: page.readingTime,
      });
    }
  });

  it("withholds a transient error while the page is still pending", () => {
    // A retryable failure stays 'pending' with the error recorded; surfacing it
    // would report a problem the poller is about to undo.
    const page = apiSavedPage(
      savedPage({
        status: "pending",
        error: "HTTP 503 Service Unavailable",
        contentHtml: null,
      }),
    );
    expect(page.extraction).toEqual({ status: "pending", error: null });
  });
});

describe("listApiSavedPages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns a page with no cursor when the stream is exhausted", async () => {
    mocks.listSavedPagePage.mockResolvedValue({
      pages: [savedPage()],
      nextCursor: null,
    });

    const page = await listApiSavedPages(7, { limit: 50, cursor: null });

    expect(mocks.listSavedPagePage).toHaveBeenCalledWith(7, 50, null);
    expect(page.data).toHaveLength(1);
    expect(page.pagination.nextCursor).toBeNull();
  });

  it("mints a continuation a client can send back unchanged", async () => {
    mocks.listSavedPagePage.mockResolvedValue({
      pages: [savedPage()],
      nextCursor: {
        savedAt: new Date("2026-07-24T09:15:00.000Z"),
        savedPageId: 31,
      },
    });

    const page = await listApiSavedPages(7, { limit: 1, cursor: null });
    const cursor = page.pagination.nextCursor ?? "";

    expect(JSON.parse(Buffer.from(cursor, "base64url").toString())).toEqual({
      version: 1,
      savedAt: "2026-07-24T09:15:00.000Z",
      savedPageId: "31",
    });
  });
});

describe("createApiSavedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("saves through the web's save path and reports the pending row", async () => {
    mocks.saveLink.mockResolvedValue({ ok: true, id: 31, alreadySaved: false });
    mocks.getSavedPage.mockResolvedValue(
      savedPage({ status: "pending", contentHtml: null, title: null }),
    );

    const result = await createApiSavedPage(7, "example.org/essays");

    expect(mocks.saveLink).toHaveBeenCalledWith(7, "example.org/essays");
    expect(result).toMatchObject({
      status: "saved",
      alreadySaved: false,
      savedPageId: 31,
    });
  });

  it("reports an existing entry rather than saving a second copy", async () => {
    mocks.saveLink.mockResolvedValue({ ok: true, id: 31, alreadySaved: true });
    mocks.getSavedPage.mockResolvedValue(savedPage());

    const result = await createApiSavedPage(7, "https://example.org/essays");

    expect(result).toMatchObject({ status: "saved", alreadySaved: true });
  });

  it("passes a rejected URL back as invalid", async () => {
    mocks.saveLink.mockResolvedValue({
      ok: false,
      error: "Enter a valid web address.",
    });

    const result = await createApiSavedPage(7, "mailto:someone@example.com");

    expect(result).toEqual({
      status: "invalid",
      message: "Enter a valid web address.",
    });
    expect(mocks.getSavedPage).not.toHaveBeenCalled();
  });
});

describe("retryApiSavedPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns the page's new extraction state", async () => {
    mocks.retrySavedPage.mockResolvedValue({ ok: true, page: savedPage() });

    const page = await retryApiSavedPage(7, 31);

    expect(mocks.retrySavedPage).toHaveBeenCalledWith(7, 31);
    expect(page?.extraction.status).toBe("ready");
  });

  it("returns null for a page that is not this account's", async () => {
    mocks.retrySavedPage.mockResolvedValue({
      ok: false,
      error: "Saved page not found.",
    });

    await expect(retryApiSavedPage(7, 31)).resolves.toBeNull();
  });
});

describe("setApiSavedPageReadingProgress", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setSavedPagesReadingProgress.mockImplementation(
      async (_userId: number, positions: unknown) => positions,
    );
  });

  it("stores only positions worth resuming from", async () => {
    const stored = await setApiSavedPageReadingProgress(7, [
      { savedPageId: 31, readingProgress: 0.42 },
      { savedPageId: 30, readingProgress: 0.99 },
      { savedPageId: 29, readingProgress: 0.01 },
    ]);

    expect(stored).toEqual([
      { savedPageId: 31, readingProgress: 0.42 },
      { savedPageId: 30, readingProgress: null },
      { savedPageId: 29, readingProgress: null },
    ]);
    expect(mocks.setSavedPagesReadingProgress).toHaveBeenCalledWith(7, stored);
  });

  it("reports an unowned batch without claiming a write", async () => {
    mocks.setSavedPagesReadingProgress.mockResolvedValue(null);

    await expect(
      setApiSavedPageReadingProgress(7, [
        { savedPageId: 31, readingProgress: 0.42 },
      ]),
    ).resolves.toBeNull();
  });
});

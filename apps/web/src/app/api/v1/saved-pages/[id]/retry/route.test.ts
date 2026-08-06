import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  retrySavedPage: vi.fn(),
}));

vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1-saved-pages", () => ({
  retryApiSavedPage: mocks.retrySavedPage,
}));

import { POST } from "./route";

const savedPage = {
  id: "31",
  url: "https://example.org/essay",
  title: "The quiet web",
  siteName: "Example Essays",
  author: null,
  savedAt: "2026-07-24T09:15:00.000Z",
  extraction: { status: "ready", error: null },
  content: { html: "<p>Readable at last.</p>" },
  preview: "Readable at last.",
  readingTime: null,
  state: { read: false, readingProgress: null },
};

function retry(id: string): Promise<Response> {
  return POST(
    new Request(`https://currentfold.test/api/v1/saved-pages/${id}/retry`, {
      method: "POST",
    }),
    { params: Promise.resolve({ id }) },
  );
}

describe("POST /api/v1/saved-pages/{id}/retry", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("waits for the retry and returns the page's new state", async () => {
    mocks.retrySavedPage.mockResolvedValue(savedPage);

    const response = await retry("31");

    expect(response.status).toBe(200);
    expect(mocks.retrySavedPage).toHaveBeenCalledWith(7, 31);
    expect(await response.json()).toEqual({ data: { savedPage } });
  });

  it("reports a retry that failed again without pretending it succeeded", async () => {
    mocks.retrySavedPage.mockResolvedValue({
      ...savedPage,
      extraction: { status: "failed", error: "HTTP 403 Forbidden" },
      content: { html: null },
      preview: null,
    });

    const response = await retry("31");

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: {
        savedPage: {
          extraction: { status: "failed", error: "HTTP 403 Forbidden" },
        },
      },
    });
  });

  it("does not retry a page that is not this account's", async () => {
    mocks.retrySavedPage.mockResolvedValue(null);

    const response = await retry("31");

    expect(response.status).toBe(404);
    expect(await response.json()).toMatchObject({
      error: { code: "saved_page_not_found" },
    });
  });

  it("rejects an id that is not an opaque id", async () => {
    const response = await retry("0");

    expect(response.status).toBe(400);
    expect(mocks.retrySavedPage).not.toHaveBeenCalled();
  });

  it("refuses an unauthenticated retry", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await retry("31");

    expect(response.status).toBe(401);
    expect(mocks.retrySavedPage).not.toHaveBeenCalled();
  });
});

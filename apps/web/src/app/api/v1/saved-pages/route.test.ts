import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  after: vi.fn(),
  authenticate: vi.fn(),
  callbacks: [] as Array<() => Promise<void>>,
  createSavedPage: vi.fn(),
  listSavedPages: vi.fn(),
  runExtraction: vi.fn(),
  spendSaveLinkBudget: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: mocks.after,
}));
vi.mock("@/lib/api-v1-auth", () => ({
  authenticateFirstPartyApiRequest: mocks.authenticate,
}));
vi.mock("@/lib/api-v1-saved-pages", () => ({
  createApiSavedPage: mocks.createSavedPage,
  listApiSavedPages: mocks.listSavedPages,
  runApiSavedPageExtraction: mocks.runExtraction,
}));
vi.mock("@/lib/save-link-limit", () => ({
  spendSaveLinkBudget: mocks.spendSaveLinkBudget,
}));

import { GET, POST } from "./route";

const savedPage = {
  id: "31",
  url: "https://example.org/essay",
  title: "https://example.org/essay",
  siteName: "example.org",
  author: null,
  savedAt: "2026-07-24T09:15:00.000Z",
  extraction: { status: "pending", error: null },
  content: { html: null },
  preview: null,
  readingTime: null,
  state: { read: false, readingProgress: null },
};

function save(body: unknown): Promise<Response> {
  return POST(
    new Request("https://currentfold.test/api/v1/saved-pages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("GET /api/v1/saved-pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.authenticate.mockResolvedValue({ id: 7 });
  });

  it("returns a keyset page a client can continue", async () => {
    mocks.listSavedPages.mockResolvedValue({
      data: [savedPage],
      pagination: { nextCursor: "next" },
    });

    const response = await GET(
      new Request("https://currentfold.test/api/v1/saved-pages?limit=1"),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(mocks.listSavedPages).toHaveBeenCalledWith(7, {
      limit: 1,
      cursor: null,
    });
    expect(await response.json()).toEqual({
      data: [savedPage],
      pagination: { nextCursor: "next" },
    });
  });

  it("rejects an unusable page size before querying", async () => {
    const response = await GET(
      new Request("https://currentfold.test/api/v1/saved-pages?limit=500"),
    );

    expect(response.status).toBe(400);
    expect(mocks.listSavedPages).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_query" },
    });
  });

  it("refuses an unauthenticated read", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await GET(
      new Request("https://currentfold.test/api/v1/saved-pages"),
    );

    expect(response.status).toBe(401);
    expect(mocks.listSavedPages).not.toHaveBeenCalled();
  });
});

describe("POST /api/v1/saved-pages", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.callbacks.length = 0;
    mocks.after.mockImplementation((callback: () => Promise<void>) => {
      mocks.callbacks.push(callback);
    });
    mocks.authenticate.mockResolvedValue({ id: 7 });
    mocks.spendSaveLinkBudget.mockResolvedValue({
      limited: false,
      retryAfterSeconds: 0,
    });
    mocks.runExtraction.mockResolvedValue(undefined);
  });

  it("answers before fetching the page and extracts afterwards", async () => {
    mocks.createSavedPage.mockResolvedValue({
      status: "saved",
      alreadySaved: false,
      savedPageId: 31,
      page: savedPage,
    });

    const response = await save({ url: "https://example.org/essay" });

    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({
      data: { alreadySaved: false, savedPage },
    });
    // The copy is fetched after the response, so a share sheet dismisses now.
    expect(mocks.runExtraction).not.toHaveBeenCalled();
    expect(mocks.callbacks).toHaveLength(1);
    await mocks.callbacks[0]();
    expect(mocks.runExtraction).toHaveBeenCalledWith(31);
  });

  it("does not re-fetch a link that is already in the queue", async () => {
    mocks.createSavedPage.mockResolvedValue({
      status: "saved",
      alreadySaved: true,
      savedPageId: 31,
      page: { ...savedPage, extraction: { status: "ready", error: null } },
    });

    const response = await save({ url: "https://example.org/essay" });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      data: { alreadySaved: true },
    });
    expect(mocks.callbacks).toHaveLength(0);
  });

  it("spends the shared save budget and reports when it is gone", async () => {
    mocks.spendSaveLinkBudget.mockResolvedValue({
      limited: true,
      retryAfterSeconds: 120,
    });

    const response = await save({ url: "https://example.org/essay" });

    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(mocks.createSavedPage).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "save_limit_reached" },
    });
  });

  it("rejects a malformed body before spending any budget", async () => {
    const response = await save({ link: "https://example.org/essay" });

    expect(response.status).toBe(400);
    expect(mocks.spendSaveLinkBudget).not.toHaveBeenCalled();
    expect(await response.json()).toMatchObject({
      error: { code: "invalid_body" },
    });
  });

  it("reports a URL the save path will not accept", async () => {
    mocks.createSavedPage.mockResolvedValue({
      status: "invalid",
      message: "Enter a valid web address.",
    });

    const response = await save({ url: "mailto:someone@example.com" });

    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: { code: "invalid_url", message: "Enter a valid web address." },
    });
  });

  it("refuses an unauthenticated save without touching the budget", async () => {
    mocks.authenticate.mockResolvedValue(null);

    const response = await save({ url: "https://example.org/essay" });

    expect(response.status).toBe(401);
    expect(mocks.spendSaveLinkBudget).not.toHaveBeenCalled();
  });
});

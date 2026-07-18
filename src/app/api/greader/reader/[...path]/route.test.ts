import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  GOOGLE_READER_READING_LIST,
  googleReaderItemId,
} from "@/lib/greader-protocol";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  listStream: vi.fn(),
  listSubscriptions: vi.fn(),
  listTags: vi.fn(),
  listUnreadCounts: vi.fn(),
  listItemsById: vi.fn(),
  listStreamItemIds: vi.fn(),
  editTags: vi.fn(),
  markRead: vi.fn(),
  quickAdd: vi.fn(),
  editSubscription: vi.fn(),
  deleteTag: vi.fn(),
  renameTag: vi.fn(),
  exportSubscriptions: vi.fn(),
  generateOpml: vi.fn(),
}));

vi.mock("@/lib/greader-auth", () => ({
  authenticateGReaderRequest: mocks.authenticate,
}));

vi.mock("@/lib/greader-sync", () => ({
  listGReaderStream: mocks.listStream,
  listGReaderSubscriptions: mocks.listSubscriptions,
  listGReaderTags: mocks.listTags,
  listGReaderUnreadCounts: mocks.listUnreadCounts,
  listGReaderItemsById: mocks.listItemsById,
  listGReaderStreamItemIds: mocks.listStreamItemIds,
  editGReaderTags: mocks.editTags,
  markGReaderStreamRead: mocks.markRead,
  quickAddGReaderSubscription: mocks.quickAdd,
  editGReaderSubscription: mocks.editSubscription,
  deleteGReaderTag: mocks.deleteTag,
  renameGReaderTag: mocks.renameTag,
}));

vi.mock("@/lib/reader", () => ({
  subscriptionsForExport: mocks.exportSubscriptions,
}));
vi.mock("@/lib/opml/generate", () => ({ generateOpml: mocks.generateOpml }));

import { GET, POST } from "./route";

const principal = {
  id: 7,
  email: "reader@example.com",
  displayName: "Reader",
};

function context(path: string[]) {
  return { params: Promise.resolve({ path }) };
}

describe("Google Reader adapter routes", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.authenticate.mockResolvedValue(principal);
  });

  it("exposes the subscription discovery contract without browser auth", async () => {
    mocks.listSubscriptions.mockResolvedValue({
      subscriptions: [{ id: "feed/https://example.com/feed.xml" }],
    });
    const response = await GET(
      new Request(
        "https://rssapp.test/api/greader/reader/api/0/subscription/list",
        {
          headers: { Authorization: "GoogleLogin auth=rssapp_api_example" },
        },
      ),
      context(["api", "0", "subscription", "list"]),
    );

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      subscriptions: [{ id: "feed/https://example.com/feed.xml" }],
    });
    expect(mocks.listSubscriptions).toHaveBeenCalledWith(7);
  });

  it("passes legacy stream query parameters through as a bounded sync request", async () => {
    mocks.listStream.mockResolvedValue({
      id: GOOGLE_READER_READING_LIST,
      title: "All items",
      updated: "1",
      items: [],
    });
    const response = await GET(
      new Request(
        "https://rssapp.test/api/greader/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=50&r=o&xt=user%2F-%2Fstate%2Fcom.google%2Fread",
      ),
      context([
        "api",
        "0",
        "stream",
        "contents",
        "user",
        "-",
        "state",
        "com.google",
        "reading-list",
      ]),
    );

    expect(response.status).toBe(200);
    expect(mocks.listStream).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        stream: { kind: "reading-list" },
        limit: 50,
        oldest: true,
        excludeTags: new Set(["user/-/state/com.google/read"]),
      }),
    );
  });

  it("uses the compact ID endpoint before requesting article content", async () => {
    mocks.listStreamItemIds.mockResolvedValue({
      itemRefs: [{ id: googleReaderItemId(42), directStreamIds: [] }],
      continuation: "next-page",
    });
    const response = await GET(
      new Request(
        "https://rssapp.test/api/greader/reader/api/0/stream/items/ids?s=user%2F-%2Fstate%2Fcom.google%2Freading-list&n=100",
      ),
      context(["api", "0", "stream", "items", "ids"]),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      itemRefs: [{ id: googleReaderItemId(42), directStreamIds: [] }],
      continuation: "next-page",
    });
    expect(mocks.listStreamItemIds).toHaveBeenCalledWith(
      7,
      expect.objectContaining({
        stream: { kind: "reading-list" },
        limit: 100,
      }),
    );
    expect(mocks.listStream).not.toHaveBeenCalled();
  });

  it("maps edit-tag item ids and repeated state tags into one reader mutation", async () => {
    const formData = new FormData();
    formData.append("i", googleReaderItemId(42));
    formData.append("a", "user/-/state/com.google/read");
    formData.append("a", "user/-/label/Research");
    const response = await POST(
      new Request("https://rssapp.test/api/greader/reader/api/0/edit-tag", {
        method: "POST",
        body: formData,
      }),
      context(["api", "0", "edit-tag"]),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK\n");
    expect(mocks.editTags).toHaveBeenCalledWith(7, {
      itemIds: [42],
      add: ["user/-/state/com.google/read", "user/-/label/Research"],
      remove: [],
    });
  });

  it("returns a plain 401 instead of redirecting a disconnected native client", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const response = await GET(
      new Request("https://rssapp.test/api/greader/reader/api/0/tag/list"),
      context(["api", "0", "tag", "list"]),
    );

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized" });
  });
});

import { describe, expect, it } from "vitest";
import type { ReaderItem } from "@/lib/reader";
import {
  type ReaderSnapshotOptions,
  reconcileReaderSnapshot,
} from "./reader-freshness";

function item(
  id: number,
  sortSeconds: number,
  patch: Partial<ReaderItem> = {},
): ReaderItem {
  return {
    kind: "item",
    id,
    title: `Article ${id}`,
    url: `https://example.com/${id}`,
    author: null,
    contentHtml: `<p>Article ${id}</p>`,
    fullContentHtml: null,
    audioUrl: null,
    audioType: null,
    publishedAt: new Date(sortSeconds * 1_000),
    sortTs: new Date(sortSeconds * 1_000),
    feedId: 1,
    feedTitle: "Example",
    read: false,
    starred: false,
    readLater: false,
    readingProgress: null,
    audioProgress: {},
    ...patch,
  };
}

function options(
  patch: Partial<ReaderSnapshotOptions> = {},
): ReaderSnapshotOptions {
  return {
    freshHasMore: false,
    oldestFirst: false,
    preserveMissing: false,
    protectedKey: null,
    pendingStateKeys: new Set(),
    unreadOnly: false,
    starredOnly: false,
    readLaterOnly: false,
    ...patch,
  };
}

describe("reader snapshot reconciliation", () => {
  it("applies fresh cross-client state without replacing unchanged media progress", () => {
    const current = [
      item(1, 10, {
        audioProgress: { "https://example.com/audio.mp3": 300 },
        readingProgress: 0.4,
      }),
    ];
    const fresh = [
      item(1, 10, {
        read: true,
        starred: true,
        audioProgress: {},
        readingProgress: null,
      }),
    ];

    expect(reconcileReaderSnapshot(current, fresh, options())).toEqual([
      expect.objectContaining({
        read: true,
        starred: true,
        readingProgress: 0.4,
        audioProgress: { "https://example.com/audio.mp3": 300 },
      }),
    ]);
  });

  it("removes rows that no longer belong to an unread snapshot", () => {
    expect(
      reconcileReaderSnapshot([item(1, 10)], [], options({ unreadOnly: true })),
    ).toEqual([]);
  });

  it("keeps an open row mounted while reflecting why it left the view", () => {
    expect(
      reconcileReaderSnapshot(
        [item(1, 10)],
        [],
        options({
          protectedKey: "item:1",
          unreadOnly: true,
        }),
      ),
    ).toEqual([expect.objectContaining({ id: 1, read: true })]);
  });

  it("keeps the open row where the reader clicked, not at the end", () => {
    // Regression: the open row was appended, so opening the top article in an
    // unread-only view moved it to the bottom of the loaded page — thousands of
    // pixels away from the click. Neighbours are what make this observable, so
    // the single-row case above cannot catch it.
    const current = [item(5, 50), item(4, 40), item(3, 30), item(2, 20)];
    const fresh = [item(4, 40), item(3, 30), item(2, 20)];

    const result = reconcileReaderSnapshot(
      current,
      fresh,
      options({ protectedKey: "item:5", unreadOnly: true }),
    );

    expect(result.map((entry) => entry.id)).toEqual([5, 4, 3, 2]);
    expect(result[0]).toMatchObject({ id: 5, read: true });
  });

  it("keeps an open row between the neighbours it sat between", () => {
    const current = [item(5, 50), item(4, 40), item(3, 30)];
    const fresh = [item(5, 50), item(3, 30)];

    const result = reconcileReaderSnapshot(
      current,
      fresh,
      options({ protectedKey: "item:4", unreadOnly: true }),
    );

    expect(result.map((entry) => entry.id)).toEqual([5, 4, 3]);
  });

  it("still lands the open row first when everything above it went away", () => {
    const current = [item(5, 50), item(4, 40), item(3, 30)];
    const fresh = [item(3, 30)];

    const result = reconcileReaderSnapshot(
      current,
      fresh,
      options({ protectedKey: "item:4", unreadOnly: true }),
    );

    expect(result.map((entry) => entry.id)).toEqual([4, 3]);
  });

  it("preserves older pages beyond the fresh first-page boundary", () => {
    const older = item(1, 10);
    const current = [item(3, 30), item(2, 20), older];
    const fresh = [item(3, 30, { read: true }), item(2, 20)];
    const result = reconcileReaderSnapshot(
      current,
      fresh,
      options({ freshHasMore: true }),
    );

    expect(result.map((entry) => entry.id)).toEqual([3, 2, 1]);
    expect(result[0].read).toBe(true);
    expect(result[2]).toBe(older);
  });

  it("does not overwrite a local reader-state mutation still in flight", () => {
    const current = [item(1, 10, { read: true })];
    const fresh = [item(1, 10, { read: false })];

    expect(
      reconcileReaderSnapshot(
        current,
        fresh,
        options({ pendingStateKeys: new Set(["item:1"]) }),
      )[0].read,
    ).toBe(true);
  });
});

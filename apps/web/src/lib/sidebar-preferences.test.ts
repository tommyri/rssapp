import { describe, expect, it } from "vitest";
import {
  orderBySavedIds,
  readSidebarPreferences,
  sidebarFeedOrderKey,
} from "./sidebar-preferences";

describe("readSidebarPreferences", () => {
  it("preserves valid saved sidebar state and ignores malformed values", () => {
    expect(
      readSidebarPreferences({
        collapsedFolderIds: [3, 3, "bad", 1],
        sidebarFolderIds: [2, 1, 2, 0],
        sidebarFeedIds: {
          ungrouped: [12, 11, 12],
          "4": [42],
          invalid: [9],
          "-1": [8],
        },
      }),
    ).toEqual({
      collapsedFolderIds: [3, 1],
      folderIds: [2, 1],
      feedIdsByFolder: { ungrouped: [12, 11], "4": [42] },
    });
  });
});

describe("orderBySavedIds", () => {
  it("applies the saved order and leaves new entries in their source order", () => {
    const entries = [
      { id: 3, title: "C" },
      { id: 1, title: "A" },
      { id: 2, title: "B" },
    ];

    expect(orderBySavedIds(entries, [2, 1], (entry) => entry.id)).toEqual([
      { id: 2, title: "B" },
      { id: 1, title: "A" },
      { id: 3, title: "C" },
    ]);
  });
});

describe("sidebarFeedOrderKey", () => {
  it("keeps ungrouped feeds separate from each folder", () => {
    expect(sidebarFeedOrderKey(null)).toBe("ungrouped");
    expect(sidebarFeedOrderKey(4)).toBe("4");
  });
});

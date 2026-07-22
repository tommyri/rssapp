import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { FeedSummary } from "@/lib/reader";
import { type SidebarFolderGroup, SidebarOrganizer } from "./sidebar-organizer";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

vi.mock("@/app/sidebar-actions", () => ({
  reorderFeedsAction: vi.fn(),
  reorderFoldersAction: vi.fn(),
  setFolderCollapsedAction: vi.fn(),
}));

vi.mock("@/components/feed-menu", () => ({
  FeedMenu: () => null,
}));

const feed: FeedSummary = {
  feedId: 1,
  title: "Example feed",
  url: "https://example.com/feed.xml",
  siteUrl: "https://example.com",
  unread: 2,
  lastError: null,
  paused: false,
  folderId: 1,
  folderName: "News",
  customTitle: null,
  feedTitle: "Example feed",
  autoReadDays: null,
  sortOrder: "newest",
  defaultUnreadOnly: true,
};

const folderGroups: SidebarFolderGroup[] = [
  { id: 1, name: "News", feeds: [feed] },
];

function renderSidebar() {
  return renderToStaticMarkup(
    createElement(SidebarOrganizer, {
      folderGroups,
      ungrouped: [],
      folderNames: ["News"],
      sidebarPreferences: {
        collapsedFolderIds: [],
        folderIds: [1],
        feedIdsByFolder: { "1": [1] },
      },
    }),
  );
}

describe("SidebarOrganizer hydration", () => {
  it("uses a stable drag-and-drop accessibility ID across server renders", () => {
    const describedBy = /aria-describedby="([^"]+)"/g;

    expect(
      [...renderSidebar().matchAll(describedBy)].map((match) => match[1]),
    ).toEqual(["sidebar-organizer", "sidebar-organizer"]);
    expect(
      [...renderSidebar().matchAll(describedBy)].map((match) => match[1]),
    ).toEqual(["sidebar-organizer", "sidebar-organizer"]);
  });
});

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

function makeFeed(feedId: number): FeedSummary {
  return {
    feedId,
    title: `Example feed ${feedId}`,
    url: `https://example.com/feed-${feedId}.xml`,
    siteUrl: "https://example.com",
    unread: 2,
    lastError: null,
    paused: false,
    folderId: 1,
    folderName: "News",
    customTitle: null,
    feedTitle: `Example feed ${feedId}`,
    autoReadDays: null,
    sortOrder: "newest",
    defaultUnreadOnly: true,
  };
}

const feed: FeedSummary = {
  ...makeFeed(1),
  title: "Example feed",
  url: "https://example.com/feed.xml",
  feedTitle: "Example feed",
};

const folderGroups: SidebarFolderGroup[] = [
  { id: 1, name: "News", feeds: [feed] },
];

function renderSidebar({
  groups = folderGroups,
  activeFeedId,
}: {
  groups?: SidebarFolderGroup[];
  activeFeedId?: number;
} = {}) {
  return renderToStaticMarkup(
    createElement(SidebarOrganizer, {
      folderGroups: groups,
      ungrouped: [],
      folderNames: ["News"],
      activeFeedId,
      sidebarPreferences: {
        collapsedFolderIds: [],
        folderIds: [1],
        feedIdsByFolder: {
          "1": groups[0]?.feeds.map((groupFeed) => groupFeed.feedId) ?? [],
        },
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

  it("renders every feed so the available-height container can reveal as many as fit", () => {
    const html = renderSidebar({
      groups: [
        {
          id: 1,
          name: "News",
          feeds: Array.from({ length: 7 }, (_, index) => makeFeed(index + 1)),
        },
      ],
    });

    expect(html).toContain("Example feed 5");
    expect(html).toContain("Example feed 6");
    expect(html).toContain("Example feed 7");
    expect(html).not.toContain("Show 2 more");
  });

  it("marks the active feed so it can be scrolled into view", () => {
    const html = renderSidebar({
      groups: [
        {
          id: 1,
          name: "News",
          feeds: Array.from({ length: 7 }, (_, index) => makeFeed(index + 1)),
        },
      ],
      activeFeedId: 7,
    });

    expect(html).toContain('data-sidebar-feed-id="7"');
    expect(html).toContain("bg-sidebar-accent font-medium");
  });
});

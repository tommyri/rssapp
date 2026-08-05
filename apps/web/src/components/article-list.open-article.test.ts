import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReaderItem } from "@/lib/reader";
import { ArticleList } from "./article-list";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  setItemReadAction: vi.fn(async () => undefined),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));
vi.mock("next/link", () => ({
  default: ({ href, children, ...props }: React.ComponentProps<"a">) =>
    createElement("a", { href, ...props }, children),
}));

vi.mock("@/app/actions", () => ({
  fetchItemsAction: vi.fn(),
  markAllReadAction: vi.fn(async () => ({ marked: 0 })),
  removeSavedPageAction: vi.fn(),
  retryFullContentAction: vi.fn(),
  retrySavedPageAction: vi.fn(),
  setItemReadAction: mocks.setItemReadAction,
  setItemReadingProgressAction: vi.fn(),
  setItemReadLaterAction: vi.fn(),
  setItemStarredAction: vi.fn(),
  setSavedPageReadAction: vi.fn(),
  setSavedPageReadingProgressAction: vi.fn(),
}));

vi.mock("@/app/highlights/actions", () => ({
  createHighlightAction: vi.fn(),
  deleteHighlightAction: vi.fn(),
  listHighlightsAction: vi.fn(async () => []),
  updateHighlightNoteAction: vi.fn(),
}));

vi.mock("@/components/article-audio-player", () => ({
  ArticleAudioPlayer: () => null,
}));
vi.mock("@/components/article-content", () => ({
  ArticleContent: () => null,
}));
vi.mock("@/components/article-label-picker", () => ({
  ArticleLabelPicker: () => null,
}));
vi.mock("@/components/save-link-form", () => ({
  SaveLinkForm: () => null,
}));
vi.mock("@/components/swipeable-row", () => ({
  SwipeableRow: ({ children }: { children: React.ReactNode }) =>
    createElement("div", null, children),
}));
vi.mock("@/components/use-reader-keyboard", () => ({
  useReaderKeyboard: () => undefined,
}));
vi.mock("@/components/use-reading-progress", () => ({
  useReadingProgress: () => ({ articleRef: { current: null }, progress: 0 }),
}));
vi.mock("@/lib/audio-progress-client", () => ({
  persistItemAudioProgress: vi.fn(),
}));
vi.mock("@/lib/offline-library", () => ({
  offlineArticleFromReaderItem: vi.fn(),
  saveOfflineArticle: vi.fn(),
}));

type DomGlobals = {
  window?: Window;
  document?: Document;
  Node?: typeof Node;
  Element?: typeof Element;
  HTMLElement?: typeof HTMLElement;
  localStorage?: Storage;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const openItem: ReaderItem = {
  kind: "item",
  id: 42,
  title: "An article worth opening",
  url: "https://example.com/article",
  author: null,
  contentHtml: "<p>Long enough to render a body and a reading estimate.</p>",
  fullContentHtml: null,
  audioUrl: null,
  audioType: null,
  publishedAt: new Date("2026-07-19T08:00:00.000Z"),
  sortTs: new Date("2026-07-19T08:00:00.000Z"),
  feedId: 1,
  feedTitle: "Example feed",
  read: true,
  starred: false,
  readLater: false,
  readingProgress: null,
  audioProgress: {},
};

function readerProps(
  overrides: Partial<React.ComponentProps<typeof ArticleList>> = {},
): React.ComponentProps<typeof ArticleList> {
  return {
    initialItems: [openItem],
    initialHasMore: false,
    view: { unreadOnly: true },
    title: "Unread",
    toggleHref: "/?show=all",
    showingAll: false,
    unreadCount: 0,
    density: "comfortable",
    embedLoading: { default: "click", providers: {} },
    offlineUserId: 1,
    availableLabels: [],
    initialExpandedId: "item:42",
    ...overrides,
  };
}

async function withReaderDom(
  run: (context: {
    mount: HTMLElement;
    document: Document;
    click: (element: Element) => Promise<void>;
  }) => Promise<void>,
  props: React.ComponentProps<typeof ArticleList> = readerProps(),
) {
  const { document, window } = parseHTML(
    '<html><body><div id="mount"></div></body></html>',
  );
  const storage = {
    getItem: vi.fn(() => null),
    setItem: vi.fn(),
    removeItem: vi.fn(),
    clear: vi.fn(),
    key: vi.fn(() => null),
    length: 0,
  } satisfies Storage;

  const globals = globalThis as typeof globalThis & DomGlobals;
  const previous: DomGlobals = {
    window: globals.window,
    document: globals.document,
    Node: globals.Node,
    Element: globals.Element,
    HTMLElement: globals.HTMLElement,
    localStorage: globals.localStorage,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    localStorage: storage,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = document.querySelector("#mount") as unknown as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await act(async () => {
      root?.render(createElement(ArticleList, props));
    });
    await run({
      mount,
      document: document as unknown as Document,
      click: async (element) => {
        await act(async () => {
          element.dispatchEvent(new window.Event("click", { bubbles: true }));
        });
      },
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    Object.assign(globals, previous);
  }
}

function actionButtons(mount: HTMLElement, label: string) {
  return [...mount.querySelectorAll("li button")].filter(
    (button) => button.textContent === label,
  );
}

afterEach(() => {
  vi.clearAllMocks();
});

describe("ArticleList open article", () => {
  it("makes an open article's title the link to its original", async () => {
    await withReaderDom(async ({ mount }) => {
      const titleLink = [...mount.querySelectorAll("li a")].find(
        (link) => link.textContent === "An article worth opening",
      );

      expect(titleLink?.getAttribute("href")).toBe(
        "https://example.com/article",
      );
      expect(titleLink?.getAttribute("target")).toBe("_blank");
      expect(titleLink?.getAttribute("rel")).toBe("noopener noreferrer");
    });
  });

  it("still closes the article when the title section is clicked", async () => {
    await withReaderDom(async ({ mount, click }) => {
      const closeButton = mount.querySelector(
        'li button[aria-label="Close article"]',
      );
      if (!closeButton) throw new Error("Close control is unavailable.");

      await click(closeButton);

      expect(
        mount.querySelector('li button[aria-label="Close article"]'),
      ).toBeNull();
      expect(mount.querySelector("li a")).toBeNull();
      expect(mount.textContent).toContain("An article worth opening");
    });
  });

  it("leaves a collapsed row opening the article rather than the original", async () => {
    await withReaderDom(
      async ({ mount }) => {
        expect(mount.querySelector("li a")).toBeNull();
        expect(mount.querySelector("li button")?.textContent).toContain(
          "An article worth opening",
        );
      },
      readerProps({ initialExpandedId: undefined }),
    );
  });

  it("offers the article's actions at the top as well as the bottom", async () => {
    await withReaderDom(async ({ mount }) => {
      expect(actionButtons(mount, "Mark unread")).toHaveLength(2);
      expect(actionButtons(mount, "Star")).toHaveLength(2);
      expect(actionButtons(mount, "Read later")).toHaveLength(2);
    });
  });

  it("marks an article unread and closes it from the top action bar", async () => {
    await withReaderDom(async ({ mount, click }) => {
      const [topMarkUnread] = actionButtons(mount, "Mark unread");
      if (!topMarkUnread) throw new Error("Mark unread is unavailable.");

      await click(topMarkUnread);

      expect(mocks.setItemReadAction).toHaveBeenCalledWith(42, false, false);
      expect(
        mount.querySelector('li button[aria-label="Close article"]'),
      ).toBeNull();
    });
  });
});

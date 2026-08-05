import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ReaderItem } from "@/lib/reader";
import { SAVED_PAGE_POLL_MAX_DURATION_MS } from "@/lib/saved-page-extraction";
import { ArticleList } from "./article-list";

const mocks = vi.hoisted(() => ({
  markAllReadAction: vi.fn(async () => ({ marked: 1 })),
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
  markAllReadAction: mocks.markAllReadAction,
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
  SwipeableRow: ({
    onSwipeRight,
    children,
  }: {
    onSwipeRight?: () => void;
    children: React.ReactNode;
  }) =>
    createElement(
      "div",
      { "data-can-swipe-right": onSwipeRight ? "true" : "false" },
      children,
    ),
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
  IntersectionObserver?: typeof IntersectionObserver;
  localStorage?: Storage;
  fetch?: typeof fetch;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

const unreadItem: ReaderItem = {
  kind: "item",
  id: 42,
  title: "An unread article",
  url: "https://example.com/article",
  author: null,
  contentHtml:
    "<p>Article content long enough to produce a preview in the row.</p>",
  fullContentHtml: null,
  audioUrl: null,
  audioType: null,
  publishedAt: new Date("2026-07-19T08:00:00.000Z"),
  sortTs: new Date("2026-07-19T08:00:00.000Z"),
  feedId: 1,
  feedTitle: "Example feed",
  read: false,
  starred: false,
  readLater: false,
  readingProgress: null,
  audioProgress: {},
};

function readerProps(
  initialItems: ReaderItem[] = [unreadItem],
): React.ComponentProps<typeof ArticleList> {
  return {
    initialItems,
    initialHasMore: false,
    view: { unreadOnly: true },
    title: "Unread",
    toggleHref: "/?show=all",
    showingAll: false,
    unreadCount: initialItems.filter((item) => !item.read).length,
    density: "comfortable",
    embedLoading: { default: "click", providers: {} },
    offlineUserId: 1,
    availableLabels: [],
  };
}

async function withReaderDom(
  run: (context: {
    mount: HTMLElement;
    document: Document;
    root: Root;
    observers: Array<{
      callback: IntersectionObserverCallback;
      observed: Element[];
    }>;
  }) => Promise<void>,
  options: {
    props?: React.ComponentProps<typeof ArticleList>;
    fetch?: typeof fetch;
  } = {},
) {
  const { document, window } = parseHTML(
    '<html><body><div id="mount"></div></body></html>',
  );
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  const observers: Array<{
    callback: IntersectionObserverCallback;
    observed: Element[];
  }> = [];

  class MockIntersectionObserver {
    readonly root = null;
    readonly rootMargin = "0px";
    readonly thresholds = [0];
    readonly observed: Element[] = [];

    constructor(readonly callback: IntersectionObserverCallback) {
      observers.push(this);
    }

    observe = (target: Element) => this.observed.push(target);
    unobserve = vi.fn();
    disconnect = vi.fn();
    takeRecords = () => [];
  }

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
    IntersectionObserver: globals.IntersectionObserver,
    localStorage: globals.localStorage,
    fetch: globals.fetch,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    IntersectionObserver: MockIntersectionObserver,
    localStorage: storage,
    ...(options.fetch ? { fetch: options.fetch } : {}),
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = document.querySelector("#mount") as unknown as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await act(async () => {
      root?.render(createElement(ArticleList, options.props ?? readerProps()));
    });
    await run({
      mount,
      document: document as unknown as Document,
      root,
      observers,
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    Object.assign(globals, previous);
  }
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ArticleList deliberate read state", () => {
  it("does not mark an unread article read when its row scrolls above the viewport", async () => {
    vi.useFakeTimers();
    await withReaderDom(async ({ observers }) => {
      await act(async () => {
        await vi.advanceTimersByTimeAsync(1_000);
      });

      expect(observers).toHaveLength(0);
      expect(mocks.setItemReadAction).not.toHaveBeenCalled();
    });
  });

  it("does not offer mark-read-on-scroll as a reader control", async () => {
    await withReaderDom(async ({ mount }) => {
      expect(mount.textContent).not.toContain("Mark read on scroll");
    });
  });

  it("does not offer an unread-to-read swipe on a collapsed unread row", async () => {
    await withReaderDom(async ({ mount }) => {
      expect(
        mount
          .querySelector("[data-can-swipe-right]")
          ?.getAttribute("data-can-swipe-right"),
      ).toBe("false");
    });
  });

  it("marks an unread article read when the reader opens it", async () => {
    await withReaderDom(async ({ mount, document }) => {
      const rowButton = mount.querySelector("li button");
      const ClickEvent = document.defaultView?.Event;
      if (!rowButton || !ClickEvent)
        throw new Error("Reader row is unavailable.");

      await act(async () => {
        rowButton.dispatchEvent(new ClickEvent("click", { bubbles: true }));
      });

      expect(mocks.setItemReadAction).toHaveBeenCalledWith(42, true, false);
    });
  });

  it("reconciles an external read change from a refreshed server snapshot", async () => {
    await withReaderDom(async ({ mount, root }) => {
      expect(mount.textContent).toContain("An unread article");

      await act(async () => {
        root.render(createElement(ArticleList, readerProps([])));
      });

      expect(mount.textContent).not.toContain("An unread article");
      expect(mount.textContent).toContain("All caught up.");
    });
  });

  it("keeps a post read this session listed after the snapshot drops it", async () => {
    await withReaderDom(async ({ mount, document, root }) => {
      const rowButton = mount.querySelector("li button");
      const ClickEvent = document.defaultView?.Event;
      if (!rowButton || !ClickEvent)
        throw new Error("Reader row is unavailable.");

      // Open (marks read), then close again so the row is no longer protected
      // by being the expanded article.
      await act(async () => {
        rowButton.dispatchEvent(new ClickEvent("click", { bubbles: true }));
      });
      await act(async () => {
        rowButton.dispatchEvent(new ClickEvent("click", { bubbles: true }));
      });

      // The refreshed unread-only snapshot no longer contains the read post.
      await act(async () => {
        root.render(createElement(ArticleList, readerProps([])));
      });

      expect(mount.textContent).toContain("An unread article");
      expect(mount.textContent).not.toContain("All caught up.");
    });
  });

  it("replaces an open saved page's pending state when extraction finishes", async () => {
    vi.useFakeTimers();
    const pendingPage: ReaderItem = {
      ...unreadItem,
      kind: "page",
      id: 7,
      title: "Pending saved page",
      feedId: 0,
      feedTitle: "Example",
      contentHtml: null,
      publishedAt: null,
      readLater: true,
      pageStatus: "pending",
      pageError: null,
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 7,
        status: "ready",
        error: null,
        title: "Readable saved page",
        author: "Example author",
        feedTitle: "Example",
        contentHtml: "<p>Readable article.</p>",
      }),
    );

    await withReaderDom(
      async ({ mount }) => {
        expect(mount.textContent).toContain("Fetching a readable copy…");

        await act(async () => {
          await vi.advanceTimersByTimeAsync(1_000);
        });

        expect(fetchMock).toHaveBeenCalledWith(
          "/api/saved-pages/7/extraction",
          expect.objectContaining({ cache: "no-store" }),
        );
        expect(mount.textContent).toContain("Readable saved page");
        expect(mount.textContent).not.toContain("Fetching a readable copy");
      },
      {
        props: {
          ...readerProps([pendingPage]),
          view: { readLater: true },
          title: "Read later",
          toggleHref: "/?view=later",
          initialExpandedId: "page:7",
        },
        fetch: fetchMock as typeof fetch,
      },
    );
  });

  it("stops implying an open saved page is still arriving once the watch ends", async () => {
    vi.useFakeTimers();
    const pendingPage: ReaderItem = {
      ...unreadItem,
      kind: "page",
      id: 7,
      title: "Pending saved page",
      feedId: 0,
      feedTitle: "Example",
      contentHtml: null,
      publishedAt: null,
      readLater: true,
      pageStatus: "pending",
      pageError: null,
    };
    const fetchMock = vi.fn(async () =>
      Response.json({
        id: 7,
        status: "pending",
        error: null,
        title: "Pending saved page",
        author: null,
        feedTitle: "Example",
        contentHtml: null,
      }),
    );

    await withReaderDom(
      async ({ mount }) => {
        expect(mount.textContent).toContain("Fetching a readable copy…");

        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_MAX_DURATION_MS);
        });

        // The extraction is still server-owned, so the copy stays truthful and
        // gives the reader the one action that resolves it.
        expect(mount.textContent).toContain("reload to check for it");
        expect(mount.textContent).not.toContain("Fetching a readable copy…");
      },
      {
        props: {
          ...readerProps([pendingPage]),
          view: { readLater: true },
          title: "Read later",
          toggleHref: "/?view=later",
          initialExpandedId: "page:7",
        },
        fetch: fetchMock as typeof fetch,
      },
    );
  });

  it("keeps Mark all read as the deliberate batch path", async () => {
    await withReaderDom(async ({ mount, document }) => {
      const markAllButton = [...mount.querySelectorAll("button")].find(
        (button) => button.textContent === "Mark all read",
      );
      const ClickEvent = document.defaultView?.Event;
      if (!markAllButton || !ClickEvent) {
        throw new Error("Mark all read control is unavailable.");
      }

      await act(async () => {
        markAllButton.dispatchEvent(new ClickEvent("click", { bubbles: true }));
      });

      expect(mocks.markAllReadAction).toHaveBeenCalledWith(
        { unreadOnly: true },
        null,
      );
    });
  });
});

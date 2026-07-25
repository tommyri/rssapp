import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  SAVED_PAGE_POLL_DELAYS_MS,
  SAVED_PAGE_POLL_MAX_DURATION_MS,
  type SavedPageExtractionSnapshot,
} from "@/lib/saved-page-extraction";
import { SavedPageExtractionWatcher } from "./saved-page-extraction-watcher";

type DomGlobals = {
  window?: Window;
  document?: Document;
  HTMLElement?: typeof HTMLElement;
  fetch?: typeof fetch;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

function snapshot(
  status: SavedPageExtractionSnapshot["status"],
): SavedPageExtractionSnapshot {
  return {
    id: 7,
    status,
    error: status === "error" ? "Publisher blocked the request." : null,
    title: "Saved article",
    author: "Example author",
    feedTitle: "Example",
    contentHtml: status === "ready" ? "<p>Readable article.</p>" : null,
  };
}

async function withWatcherDom(
  fetchMock: ReturnType<typeof vi.fn>,
  onResolved: (result: SavedPageExtractionSnapshot) => void,
  run: (context: {
    window: Window & typeof globalThis;
    setVisible: (visible: boolean) => void;
  }) => Promise<void>,
  onExhaustedChange: (exhausted: boolean) => void = () => {},
): Promise<Window & typeof globalThis> {
  const parsed = parseHTML('<html><body><div id="mount"></div></body></html>');
  let visible = true;
  Object.defineProperty(parsed.document, "visibilityState", {
    configurable: true,
    get: () => (visible ? "visible" : "hidden"),
  });

  const globals = globalThis as typeof globalThis & DomGlobals;
  const previous: DomGlobals = {
    window: globals.window,
    document: globals.document,
    HTMLElement: globals.HTMLElement,
    fetch: globals.fetch,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window: parsed.window,
    document: parsed.document,
    HTMLElement: parsed.window.HTMLElement,
    fetch: fetchMock,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = parsed.document.querySelector("#mount") as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await act(async () => {
      root?.render(
        createElement(SavedPageExtractionWatcher, {
          pageId: 7,
          onResolved,
          onExhaustedChange,
        }),
      );
    });
    await run({
      window: parsed.window as unknown as Window & typeof globalThis,
      setVisible: (next) => {
        visible = next;
      },
    });
  } finally {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    Object.assign(globals, previous);
  }

  return parsed.window as unknown as Window & typeof globalThis;
}

function jsonResponse(value: unknown): Response {
  return Response.json(value, { status: 200 });
}

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

/** How many times this watch reported that it had given up. */
function giveUps(onExhaustedChange: ReturnType<typeof vi.fn>): number {
  return onExhaustedChange.mock.calls.filter(
    ([exhausted]) => exhausted === true,
  ).length;
}

describe("SavedPageExtractionWatcher", () => {
  it("backs off while pending and resolves as soon as content is ready", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(snapshot("pending")))
      .mockResolvedValueOnce(jsonResponse(snapshot("ready")));
    const onResolved = vi.fn();
    const onExhaustedChange = vi.fn();

    await withWatcherDom(
      fetchMock,
      onResolved,
      async () => {
        // A fresh watch clears any give-up left by the previous one.
        expect(onExhaustedChange).toHaveBeenCalledWith(false);

        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_DELAYS_MS[0] ?? 0);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onResolved).not.toHaveBeenCalled();

        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_DELAYS_MS[1] ?? 0);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(onResolved).toHaveBeenCalledWith(snapshot("ready"));

        await act(async () => {
          await vi.advanceTimersByTimeAsync(30_000);
        });
        expect(fetchMock).toHaveBeenCalledTimes(2);
        // Resolving is not giving up: the reader keeps the readable copy.
        expect(giveUps(onExhaustedChange)).toBe(0);
      },
      onExhaustedChange,
    );
  });

  it("reports giving up once the watch budget runs out while still pending", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(snapshot("pending")));
    const onResolved = vi.fn();
    const onExhaustedChange = vi.fn();

    await withWatcherDom(
      fetchMock,
      onResolved,
      async () => {
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_MAX_DURATION_MS);
        });
        expect(giveUps(onExhaustedChange)).toBe(1);
        expect(onResolved).not.toHaveBeenCalled();

        // Giving up stops the watch rather than backing off forever.
        const settled = fetchMock.mock.calls.length;
        await act(async () => {
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_MAX_DURATION_MS);
        });
        expect(fetchMock).toHaveBeenCalledTimes(settled);
        expect(giveUps(onExhaustedChange)).toBe(1);
      },
      onExhaustedChange,
    );
  });

  it("does no polling while hidden and resumes immediately when visible", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse(snapshot("error")));
    const onResolved = vi.fn();

    await withWatcherDom(
      fetchMock,
      onResolved,
      async ({ window, setVisible }) => {
        setVisible(false);
        await act(async () => {
          window.document.dispatchEvent(new window.Event("visibilitychange"));
          await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_DELAYS_MS[0] ?? 0);
        });
        expect(fetchMock).not.toHaveBeenCalled();

        setVisible(true);
        await act(async () => {
          window.document.dispatchEvent(new window.Event("visibilitychange"));
          await vi.advanceTimersByTimeAsync(0);
        });
        expect(fetchMock).toHaveBeenCalledTimes(1);
        expect(onResolved).toHaveBeenCalledWith(snapshot("error"));
      },
    );
  });

  it("cleans up its timer and listeners when the page closes", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn();
    const window = await withWatcherDom(fetchMock, vi.fn(), async () => {});

    await vi.advanceTimersByTimeAsync(SAVED_PAGE_POLL_DELAYS_MS[0] ?? 0);
    window.document.dispatchEvent(new window.Event("visibilitychange"));
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

import { parseHTML } from "linkedom";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  READER_FRESHNESS_INTERVAL_MS,
  READER_RETURN_MINIMUM_MS,
} from "@/lib/reader-freshness";
import { ReaderFreshness } from "./reader-freshness";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

type DomGlobals = {
  window?: Window;
  document?: Document;
  HTMLElement?: typeof HTMLElement;
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function withFreshnessDom(
  run: (context: {
    window: Window & typeof globalThis;
    setVisible: (visible: boolean) => void;
  }) => Promise<void>,
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
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window: parsed.window,
    document: parsed.document,
    HTMLElement: parsed.window.HTMLElement,
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = parsed.document.querySelector("#mount") as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await act(async () => {
      root?.render(createElement(ReaderFreshness));
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});

describe("ReaderFreshness", () => {
  it("refreshes after a meaningful return and deduplicates focus events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));

    await withFreshnessDom(async ({ window }) => {
      expect(mocks.refresh).not.toHaveBeenCalled();

      await act(async () => {
        window.dispatchEvent(new window.Event("blur"));
        await vi.advanceTimersByTimeAsync(READER_RETURN_MINIMUM_MS);
        window.dispatchEvent(new window.Event("focus"));
        window.dispatchEvent(new window.Event("focus"));
      });

      expect(mocks.refresh).toHaveBeenCalledTimes(1);
    });
  });

  it("does no background work and catches up when visible again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));

    await withFreshnessDom(async ({ window, setVisible }) => {
      setVisible(false);
      await act(async () => {
        window.document.dispatchEvent(new window.Event("visibilitychange"));
        await vi.advanceTimersByTimeAsync(READER_FRESHNESS_INTERVAL_MS);
      });
      expect(mocks.refresh).not.toHaveBeenCalled();

      setVisible(true);
      await act(async () => {
        window.document.dispatchEvent(new window.Event("visibilitychange"));
      });
      expect(mocks.refresh).toHaveBeenCalledTimes(1);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(READER_FRESHNESS_INTERVAL_MS);
      });
      expect(mocks.refresh).toHaveBeenCalledTimes(2);
    });
  });

  it("removes its listeners and interval when unmounted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));

    const window = await withFreshnessDom(async () => {});
    await vi.advanceTimersByTimeAsync(READER_FRESHNESS_INTERVAL_MS);
    window.dispatchEvent(new window.Event("blur"));
    await vi.advanceTimersByTimeAsync(READER_RETURN_MINIMUM_MS);
    window.dispatchEvent(new window.Event("focus"));

    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

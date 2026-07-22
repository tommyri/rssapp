import { parseHTML } from "linkedom";
import { act, createElement, useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { describe, expect, it } from "vitest";
import { withAudioProgress } from "@/lib/audio-progress";
import { ArticleContent } from "./article-content";

type DomGlobals = {
  window?: Window;
  document?: Document;
  Node?: typeof Node;
  Element?: typeof Element;
  HTMLElement?: typeof HTMLElement;
  HTMLAudioElement?: typeof HTMLAudioElement;
  MutationObserver?: typeof MutationObserver;
  Event?: typeof Event;
  NodeFilter?: { SHOW_TEXT: number };
  IS_REACT_ACT_ENVIRONMENT?: boolean;
};

async function withReactDom(
  run: (mount: HTMLElement, document: Document, root: Root) => Promise<void>,
) {
  const { document, window } = parseHTML(
    '<html><body><div id="mount"></div></body></html>',
  );
  const globals = globalThis as typeof globalThis & DomGlobals;
  const previous: DomGlobals = {
    window: globals.window,
    document: globals.document,
    Node: globals.Node,
    Element: globals.Element,
    HTMLElement: globals.HTMLElement,
    HTMLAudioElement: globals.HTMLAudioElement,
    MutationObserver: globals.MutationObserver,
    Event: globals.Event,
    NodeFilter: globals.NodeFilter,
    IS_REACT_ACT_ENVIRONMENT: globals.IS_REACT_ACT_ENVIRONMENT,
  };
  Object.assign(globals, {
    window,
    document,
    Node: window.Node,
    Element: window.Element,
    HTMLElement: window.HTMLElement,
    HTMLAudioElement: window.HTMLAudioElement,
    MutationObserver: window.MutationObserver,
    Event: window.Event,
    NodeFilter: { SHOW_TEXT: 4 },
    IS_REACT_ACT_ENVIRONMENT: true,
  });

  const mount = document.querySelector("#mount") as unknown as HTMLElement;
  let root: Root | null = createRoot(mount);
  try {
    await run(mount, document as unknown as Document, root);
  } finally {
    if (root) {
      await act(async () => root?.unmount());
      root = null;
    }
    Object.assign(globals, previous);
  }
}

describe("ArticleContent audio progress rerenders", () => {
  it("keeps the native player mounted when the first inline progress write updates reader state", async () => {
    await withReactDom(async (mount, document, root) => {
      function Harness() {
        const [progress, setProgress] = useState<Record<string, number>>({});
        return createElement(ArticleContent, {
          html: '<audio src="https://cdn.example.com/episode.m4a"></audio>',
          embedLoading: { defaultMode: "defer", providers: {} },
          itemId: 42,
          audioProgress: progress,
          onAudioProgressChange: async (url, position) => {
            setProgress((current) => withAudioProgress(current, url, position));
            return true;
          },
        });
      }

      await act(async () => {
        root.render(createElement(Harness));
      });
      const audio = mount.querySelector("audio") as HTMLAudioElement;
      Object.defineProperties(audio, {
        currentTime: { configurable: true, value: 0, writable: true },
        duration: { configurable: true, value: Number.POSITIVE_INFINITY },
        readyState: { configurable: true, value: 1 },
      });
      const AudioEvent = document.defaultView?.Event;
      if (!AudioEvent) throw new Error("Test DOM does not provide Event.");

      await act(async () => {
        audio.dispatchEvent(new AudioEvent("loadedmetadata"));
        audio.currentTime = 1;
        audio.dispatchEvent(new AudioEvent("timeupdate"));
      });

      expect(mount.querySelector("audio")).toBe(audio);
      expect(audio.currentTime).toBe(1);
    });
  });
});

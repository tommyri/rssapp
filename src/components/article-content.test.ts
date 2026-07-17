import { parseHTML } from "linkedom";
import { describe, expect, it } from "vitest";
import { bindArticleAudioProgress } from "@/lib/article-audio-progress";
import { renderHighlights, syncHighlightNotes } from "./article-content";

function withDom<T>(html: string, run: (root: HTMLElement) => T): T {
  const { document } = parseHTML(`<div id="root">${html}</div>`);
  const root = document.querySelector("#root") as unknown as HTMLElement;
  const globalWithDom = globalThis as typeof globalThis & {
    document?: Document;
    NodeFilter?: { SHOW_TEXT: number };
  };
  const previousDocument = globalWithDom.document;
  const previousNodeFilter = globalWithDom.NodeFilter;
  const textPrototype = Object.getPrototypeOf(root.firstChild) as {
    splitText?: (offset: number) => Text;
  };
  const previousSplitText = textPrototype.splitText;

  globalWithDom.document = document as unknown as Document;
  globalWithDom.NodeFilter = { SHOW_TEXT: 4 };
  textPrototype.splitText = function splitText(this: Text, offset: number) {
    const tail = document.createTextNode(this.data.slice(offset));
    this.data = this.data.slice(0, offset);
    this.parentNode?.insertBefore(tail, this.nextSibling);
    return tail as unknown as Text;
  };

  try {
    return run(root);
  } finally {
    globalWithDom.document = previousDocument;
    globalWithDom.NodeFilter = previousNodeFilter;
    textPrototype.splitText = previousSplitText;
  }
}

describe("renderHighlights", () => {
  it("keeps an anchored passage in the DOM after the selection has ended", () => {
    withDom("A reader should preserve the exact selected passage.", (root) => {
      renderHighlights(root, [
        {
          id: 1,
          quote: "reader",
          startOffset: 2,
          endOffset: 8,
          note: null,
        },
      ]);

      const mark = root.querySelector("mark[data-reader-highlight='1']");
      expect(mark?.textContent).toBe("reader");
      expect(root.textContent).toBe(
        "A reader should preserve the exact selected passage.",
      );
    });
  });

  it("wraps a selection spanning inline elements", () => {
    withDom("Read this <strong>exact</strong> passage.", (root) => {
      renderHighlights(root, [
        {
          id: 1,
          quote: "this exact",
          startOffset: 5,
          endOffset: 15,
          note: null,
        },
      ]);

      const marks = root.querySelectorAll("mark[data-reader-highlight='1']");
      expect(marks).toHaveLength(2);
      expect([...marks].map((mark) => mark.textContent).join("")).toBe(
        "this exact",
      );
      expect(root.textContent).toBe("Read this exact passage.");
    });
  });

  it("keeps persisted highlights visible after a second render", () => {
    withDom("A reader returns to the important passage.", (root) => {
      const highlights = [
        {
          id: 1,
          quote: "important",
          startOffset: 24,
          endOffset: 33,
          note: "Revisit this.",
        },
      ];

      renderHighlights(root, highlights);
      renderHighlights(root, highlights);

      const mark = root.querySelector("mark[data-reader-highlight='1']");
      expect(mark?.textContent).toBe("important");
      expect(mark?.dataset.readerNote).toBe("true");
      expect(root.textContent).toBe(
        "A reader returns to the important passage.",
      );
    });
  });

  it("survives committing the rendered annotation HTML", () => {
    withDom("A reader returns to the important passage.", (root) => {
      const highlight = {
        id: 1,
        quote: "important",
        startOffset: 24,
        endOffset: 33,
        note: null,
      };
      renderHighlights(root, [highlight]);

      // ArticleContent commits this string to its React-owned HTML state before
      // popovers change local UI state and trigger another React render.
      const committedHtml = root.innerHTML;
      root.innerHTML = committedHtml;

      const mark = root.querySelector("mark[data-reader-highlight='1']");
      expect(mark?.textContent).toBe("important");
      expect(root.textContent).toBe(
        "A reader returns to the important passage.",
      );
    });
  });

  it("keeps overlapping annotations clickable without nesting their marks", () => {
    withDom("A whole paragraph has one short sentence.", (root) => {
      const text = root.textContent ?? "";
      const nestedQuote = "one short sentence";
      const nestedStart = text.indexOf(nestedQuote);
      renderHighlights(
        root,
        [
          {
            id: 1,
            quote: text,
            startOffset: 0,
            endOffset: text.length,
            note: "Paragraph note.",
          },
          {
            id: 2,
            quote: nestedQuote,
            startOffset: nestedStart,
            endOffset: nestedStart + nestedQuote.length,
            note: "Sentence note.",
          },
        ],
        2,
      );

      const overlap = root.querySelector(
        "mark[data-reader-highlight-ids='1,2']",
      );
      expect(overlap?.textContent).toBe(nestedQuote);
      expect(overlap?.dataset.readerHighlightCount).toBe("2");
      expect(overlap?.dataset.readerHighlightFocus).toBe("true");
      expect(root.querySelectorAll("mark mark")).toHaveLength(0);
      expect(root.textContent).toBe(text);
    });
  });

  it("updates a note without rebuilding or losing its highlighted passage", () => {
    withDom("A reader returns to the important passage.", (root) => {
      const highlight = {
        id: 1,
        quote: "important",
        startOffset: 24,
        endOffset: 33,
        note: null,
      };
      renderHighlights(root, [highlight]);

      syncHighlightNotes(root, [{ ...highlight, note: "Revisit this." }]);

      const mark = root.querySelector("mark[data-reader-highlight='1']");
      expect(mark?.textContent).toBe("important");
      expect(mark?.dataset.readerNote).toBe("true");
    });
  });
});

describe("bindArticleAudioProgress", () => {
  it("restores and persists playback for audio embedded in article HTML", () => {
    withDom(
      '<audio src="https://cdn.example.com/episodes/recap.m4a"></audio>',
      (root) => {
        const audio = root.querySelector("audio") as HTMLAudioElement;
        const AudioEvent = root.ownerDocument.defaultView?.Event;
        if (!AudioEvent) throw new Error("Test DOM does not provide Event.");
        Object.defineProperties(audio, {
          currentTime: { configurable: true, value: 0, writable: true },
          duration: { configurable: true, value: Number.POSITIVE_INFINITY },
        });
        const changes: Array<[string, number | null]> = [];
        const cleanup = bindArticleAudioProgress(root, {
          initialProgressByUrl: {
            "https://cdn.example.com/episodes/recap.m4a": 3_600,
          },
          onProgressChange: (url, progress) => changes.push([url, progress]),
        });

        audio.dispatchEvent(new AudioEvent("loadedmetadata"));
        expect(audio.currentTime).toBe(3_600);

        audio.currentTime = 3_630;
        audio.dispatchEvent(new AudioEvent("seeked"));
        expect(changes).toEqual([
          ["https://cdn.example.com/episodes/recap.m4a", 3_630],
        ]);

        cleanup();
      },
    );
  });

  it("restores when audio metadata loaded before the binding is attached", () => {
    withDom(
      '<audio src="https://cdn.example.com/episodes/already-ready.m4a"></audio>',
      (root) => {
        const audio = root.querySelector("audio") as HTMLAudioElement;
        Object.defineProperties(audio, {
          currentTime: { configurable: true, value: 0, writable: true },
          duration: { configurable: true, value: 3_600 },
          readyState: { configurable: true, value: 1 },
        });

        const cleanup = bindArticleAudioProgress(root, {
          initialProgressByUrl: {
            "https://cdn.example.com/episodes/already-ready.m4a": 1_800,
          },
          onProgressChange: () => undefined,
        });

        expect(audio.currentTime).toBe(1_800);
        cleanup();
      },
    );
  });
});

import { describe, expect, it } from "vitest";
import { articleSnippet } from "./article-snippet";

// Every input below is real text taken from the reader's own subscriptions.
describe("article row previews", () => {
  it("drops a publication date the feed repeated in the body", () => {
    const preview = articleSnippet(
      "<p>25th July 2026 More than any of these eval scores, what is most exciting to me is something else: Opus 5 is our least prompt injectable model yet.</p>",
      "Quoting Boris Cherny",
    );

    expect(preview.startsWith("More than any of these eval scores")).toBe(true);
  });

  it("drops the 'written on' form and its date too", () => {
    const preview = articleSnippet(
      "written on July 24, 2026 Codeberg recently changed its terms to exclude projects that are largely written with generative AI.",
      "Codeberg Divides",
    );

    expect(preview.startsWith("Codeberg recently changed its terms")).toBe(
      true,
    );
  });

  it("closes the gap tag stripping leaves before punctuation", () => {
    const preview = articleSnippet(
      "<p>Comics I enjoy: <a>Three Word Phrase</a> , <a>SMBC</a> , <a>Dinosaur Comics</a> , <a>Oglaf</a> (nsfw), a longer tail so this clears the minimum length.</p>",
      "Recursive Trucker's Hitch",
    );

    expect(preview).toContain("Three Word Phrase, SMBC, Dinosaur Comics");
    expect(preview).not.toContain(" ,");
  });

  it("closes the same gap before a full stop", () => {
    const preview = articleSnippet(
      "<p>Lower catch this year . As usual, you can also use this squid post to talk about the security stories in the news that I haven't covered.</p>",
      "Friday Squid Blogging",
    );

    expect(preview.startsWith("Lower catch this year. As usual")).toBe(true);
  });

  it("never ends mid-word, and says it was cut", () => {
    const long = `${"Kubernetes operators reconcile desired state continuously ".repeat(8)}end`;
    const preview = articleSnippet(long, "Operators");

    expect(preview.endsWith("…")).toBe(true);
    expect(preview.length).toBeLessThanOrEqual(221);

    // The real property: what was kept is a prefix of the source that stops at
    // a word boundary, so the next character in the source is a space. A cut of
    // "continuously" into "continuous" would fail this.
    const kept = preview.slice(0, -1);
    expect(long.startsWith(kept)).toBe(true);
    expect(long.charAt(kept.length)).toBe(" ");
  });

  it("does not repeat the title the reader is already looking at", () => {
    const preview = articleSnippet(
      "Introducing Claude Opus 5. I've been offline kayaking with sea otters for much of today so I haven't had a chance to put it through its paces.",
      "Introducing Claude Opus 5",
    );

    expect(preview.startsWith("I've been offline kayaking")).toBe(true);
  });

  it("stays empty when there is nothing worth previewing", () => {
    expect(articleSnippet("<p>Comments</p>", "A link post")).toBe("");
    expect(articleSnippet(null, "No body")).toBe("");
    expect(
      articleSnippet(
        "<p>A title and nothing else</p>",
        "A title and nothing else",
      ),
    ).toBe("");
  });

  it("leaves a feed whose posts really are link lists alone", () => {
    // Guessing here would delete real content, so the preview keeps it.
    const preview = articleSnippet(
      "<p>Comics I enjoy: Three Word Phrase, SMBC, Dinosaur Comics, Oglaf, A Softer World, Buttersafe, Perry Bible Fellowship</p>",
      "Recursive Trucker's Hitch",
    );

    expect(preview).toContain("Perry Bible Fellowship");
  });
});

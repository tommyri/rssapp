import { describe, expect, it } from "vitest";
import { canonicalizeUrl } from "./canonical-url";

describe("canonicalizeUrl — scheme & host", () => {
  it("adds https:// when the scheme is missing", () => {
    expect(canonicalizeUrl("example.com/post")).toBe(
      "https://example.com/post",
    );
  });

  it("preserves an explicit http:// scheme", () => {
    expect(canonicalizeUrl("http://example.com/post")).toBe(
      "http://example.com/post",
    );
  });

  it("lowercases the host but preserves path case", () => {
    expect(canonicalizeUrl("https://Example.COM/Some/Path")).toBe(
      "https://example.com/Some/Path",
    );
  });

  it("trims surrounding whitespace", () => {
    expect(canonicalizeUrl("  https://example.com/x  ")).toBe(
      "https://example.com/x",
    );
  });
});

describe("canonicalizeUrl — tracking params & fragment", () => {
  it("strips utm_* params but keeps meaningful ones", () => {
    expect(
      canonicalizeUrl("https://example.com/a?utm_source=nl&id=5&utm_medium=x"),
    ).toBe("https://example.com/a?id=5");
  });

  it("strips known click/tracking params (fbclid, gclid, ref, igshid)", () => {
    expect(
      canonicalizeUrl(
        "https://example.com/a?fbclid=1&gclid=2&ref=twitter&igshid=9&q=hi",
      ),
    ).toBe("https://example.com/a?q=hi");
  });

  it("drops the fragment", () => {
    expect(canonicalizeUrl("https://example.com/a#section-2")).toBe(
      "https://example.com/a",
    );
  });

  it("keeps a query with no tracking params untouched", () => {
    expect(canonicalizeUrl("https://example.com/a?b=2&a=1")).toBe(
      "https://example.com/a?b=2&a=1",
    );
  });
});

describe("canonicalizeUrl — dedup", () => {
  it("collapses links that differ only by tracking params and fragment", () => {
    const a = canonicalizeUrl("https://blog.example.com/post?utm_source=rss");
    const b = canonicalizeUrl("https://blog.example.com/post#comments");
    expect(a).toBe(b);
  });

  it("normalizes a bare host to a trailing slash", () => {
    expect(canonicalizeUrl("example.com")).toBe("https://example.com/");
  });
});

describe("canonicalizeUrl — rejects unusable input", () => {
  it("returns null for empty or whitespace", () => {
    expect(canonicalizeUrl("")).toBeNull();
    expect(canonicalizeUrl("   ")).toBeNull();
  });

  it("returns null for a bare word (no dot in host)", () => {
    expect(canonicalizeUrl("hello")).toBeNull();
  });

  it("returns null for non-http(s) schemes", () => {
    expect(canonicalizeUrl("javascript:alert(1)")).toBeNull();
    expect(canonicalizeUrl("mailto:me@example.com")).toBeNull();
    expect(canonicalizeUrl("ftp://example.com/file")).toBeNull();
  });

  it("returns null for input that can't be parsed as a URL", () => {
    expect(canonicalizeUrl("http://")).toBeNull();
  });
});

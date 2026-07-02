import { describe, expect, it } from "vitest";
import {
  combineActions,
  type RuleSpec,
  ruleMatches,
  validatePattern,
} from "./engine";

const item = {
  title: "Show HN: A tiny RSS reader",
  author: "Jane Doe",
  contentHtml:
    '<p>Built with <a href="https://example.com">Postgres</a> and love.</p>',
};

function rule(overrides: Partial<RuleSpec>): RuleSpec {
  return { field: "title", matchType: "contains", pattern: "", ...overrides };
}

describe("ruleMatches — contains", () => {
  it("matches case-insensitively on title", () => {
    expect(ruleMatches(rule({ pattern: "show hn" }), item)).toBe(true);
  });

  it("does not match absent keywords", () => {
    expect(ruleMatches(rule({ pattern: "bitcoin" }), item)).toBe(false);
  });

  it("matches on author", () => {
    expect(ruleMatches(rule({ field: "author", pattern: "jane" }), item)).toBe(
      true,
    );
  });

  it("matches content with HTML stripped", () => {
    expect(
      ruleMatches(rule({ field: "content", pattern: "postgres" }), item),
    ).toBe(true);
  });

  it("does not match text that only appears inside HTML tags", () => {
    expect(
      ruleMatches(rule({ field: "content", pattern: "example.com" }), item),
    ).toBe(false);
  });

  it("never matches when the field is empty", () => {
    expect(
      ruleMatches(rule({ pattern: "anything" }), { ...item, title: null }),
    ).toBe(false);
    // An empty pattern on an empty field must not match everything.
    expect(ruleMatches(rule({ pattern: "" }), { ...item, title: null })).toBe(
      false,
    );
  });
});

describe("ruleMatches — regex", () => {
  it("matches with case-insensitive regex", () => {
    expect(
      ruleMatches(rule({ matchType: "regex", pattern: "^show hn:" }), item),
    ).toBe(true);
  });

  it("supports alternation", () => {
    expect(
      ruleMatches(rule({ matchType: "regex", pattern: "bitcoin|rss" }), item),
    ).toBe(true);
  });

  it("treats an invalid regex as non-matching", () => {
    expect(ruleMatches(rule({ matchType: "regex", pattern: "([" }), item)).toBe(
      false,
    );
  });
});

describe("validatePattern", () => {
  it("rejects empty and whitespace-only patterns", () => {
    expect(validatePattern("contains", "")).not.toBeNull();
    expect(validatePattern("contains", "   ")).not.toBeNull();
  });

  it("rejects oversized patterns", () => {
    expect(validatePattern("contains", "x".repeat(501))).not.toBeNull();
  });

  it("rejects invalid regexes with a message", () => {
    expect(validatePattern("regex", "([")).toMatch(/Invalid regex/);
  });

  it("accepts valid input", () => {
    expect(validatePattern("contains", "show hn")).toBeNull();
    expect(validatePattern("regex", "^Show HN:")).toBeNull();
  });
});

describe("combineActions", () => {
  it("folds multiple matching rules into one flag set", () => {
    expect(combineActions(["mute", "star"])).toEqual({
      muted: true,
      read: false,
      starred: true,
    });
    expect(combineActions([])).toEqual({
      muted: false,
      read: false,
      starred: false,
    });
  });
});

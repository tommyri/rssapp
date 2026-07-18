// Pure rule-matching logic — no database, no framework. Applied at ingest for
// new items and retroactively when a rule is created (docs/features.md v1).

export const RULE_FIELDS = ["title", "content", "author"] as const;
export const RULE_MATCH_TYPES = ["contains", "regex"] as const;
export const RULE_ACTIONS = [
  "mute",
  "mark_read",
  "star",
  "tag",
  "notify",
] as const;

export type RuleField = (typeof RULE_FIELDS)[number];
export type RuleMatchType = (typeof RULE_MATCH_TYPES)[number];
export type RuleAction = (typeof RULE_ACTIONS)[number];

export interface RuleSpec {
  field: RuleField;
  matchType: RuleMatchType;
  pattern: string;
}

export interface MatchableItem {
  title: string | null;
  author: string | null;
  contentHtml: string | null;
}

const MAX_PATTERN_LENGTH = 500;

/**
 * Validate a pattern for the given match type. Returns an error message, or
 * null if the pattern is usable.
 */
export function validatePattern(
  matchType: RuleMatchType,
  pattern: string,
): string | null {
  if (!pattern.trim()) return "Pattern must not be empty.";
  if (pattern.length > MAX_PATTERN_LENGTH) {
    return `Pattern must be at most ${MAX_PATTERN_LENGTH} characters.`;
  }
  if (matchType === "regex") {
    try {
      new RegExp(pattern, "i");
    } catch (err) {
      return `Invalid regex: ${err instanceof Error ? err.message : String(err)}`;
    }
  }
  return null;
}

/** Crude but sufficient: drop tags so keywords don't match inside HTML markup. */
function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, " ");
}

function fieldText(field: RuleField, item: MatchableItem): string {
  switch (field) {
    case "title":
      return item.title ?? "";
    case "author":
      return item.author ?? "";
    case "content":
      return item.contentHtml ? stripHtml(item.contentHtml) : "";
  }
}

/** Does this rule match this item? Invalid regexes never match. */
export function ruleMatches(rule: RuleSpec, item: MatchableItem): boolean {
  const text = fieldText(rule.field, item);
  if (!text) return false;

  if (rule.matchType === "contains") {
    return text.toLowerCase().includes(rule.pattern.toLowerCase());
  }
  try {
    return new RegExp(rule.pattern, "i").test(text);
  } catch {
    return false;
  }
}

export interface ActionFlags {
  muted: boolean;
  read: boolean;
  starred: boolean;
  notify: boolean;
}

/** Fold the actions of every matching rule into one set of state flags. */
export function combineActions(actions: RuleAction[]): ActionFlags {
  return {
    muted: actions.includes("mute"),
    read: actions.includes("mark_read"),
    starred: actions.includes("star"),
    notify: actions.includes("notify"),
  };
}

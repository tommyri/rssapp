import { describe, expect, it } from "vitest";
import {
  DEFAULT_RULE_ACTION,
  RULE_ACTION_OPTIONS,
} from "./rule-action-options";

describe("rule action options", () => {
  it("defaults to star and places notifications next", () => {
    expect(DEFAULT_RULE_ACTION).toBe("star");
    expect(RULE_ACTION_OPTIONS.map((option) => option.value)).toEqual([
      "star",
      "notify",
      "mute",
      "mark_read",
      "tag",
    ]);
  });
});

import type { RuleAction } from "@/lib/rules";

export const RULE_ACTION_OPTIONS = [
  { value: "star", label: "star" },
  { value: "notify", label: "add to notifications" },
  { value: "mute", label: "mute" },
  { value: "mark_read", label: "mark read" },
  { value: "tag", label: "apply label" },
] as const satisfies readonly {
  value: RuleAction;
  label: string;
}[];

export const DEFAULT_RULE_ACTION: RuleAction = RULE_ACTION_OPTIONS[0].value;

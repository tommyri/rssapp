"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUserId } from "@/lib/current-user";
import {
  applyRuleToExistingItems,
  createRule,
  deleteRule,
  previewRuleAgainstRecentItems,
  RULE_ACTIONS,
  RULE_FIELDS,
  RULE_MATCH_TYPES,
  type RuleAction,
  type RulePreviewMatch,
  setRuleEnabled,
  validatePattern,
} from "@/lib/rules";

export interface RuleActionState {
  ok: boolean;
  message: string;
}

export interface RulePreviewState extends RuleActionState {
  action?: RuleAction;
  sampleSize?: number;
  matches?: RulePreviewMatch[];
}

const newRuleSchema = z.object({
  feedId: z.coerce.number().int().positive().nullable(),
  field: z.enum(RULE_FIELDS),
  matchType: z.enum(RULE_MATCH_TYPES),
  pattern: z.string(),
  action: z.enum(RULE_ACTIONS),
  applyExisting: z.boolean(),
});

function parseNewRule(formData: FormData) {
  const rawFeedId = String(formData.get("feedId") ?? "");
  return newRuleSchema.safeParse({
    feedId: rawFeedId === "all" || rawFeedId === "" ? null : rawFeedId,
    field: formData.get("field"),
    matchType: formData.get("matchType"),
    pattern: String(formData.get("pattern") ?? "").trim(),
    action: formData.get("action"),
    applyExisting: formData.get("applyExisting") === "on",
  });
}

export async function createRuleAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const parsed = parseNewRule(formData);
  if (!parsed.success) return { ok: false, message: "Invalid rule input." };

  const { applyExisting, ...rule } = parsed.data;
  const patternError = validatePattern(rule.matchType, rule.pattern);
  if (patternError) return { ok: false, message: patternError };

  const userId = await getCurrentUserId();
  await createRule(userId, rule);

  let suffix = "";
  if (applyExisting) {
    const matched = await applyRuleToExistingItems(userId, rule);
    suffix = ` Applied to ${matched} existing article${matched === 1 ? "" : "s"}.`;
  }

  revalidatePath("/rules");
  revalidatePath("/");
  return { ok: true, message: `Rule created.${suffix}` };
}

export async function previewRuleAction(
  _prev: RulePreviewState,
  formData: FormData,
): Promise<RulePreviewState> {
  const parsed = parseNewRule(formData);
  if (!parsed.success) return { ok: false, message: "Invalid rule input." };

  const { applyExisting: _applyExisting, ...rule } = parsed.data;
  const patternError = validatePattern(rule.matchType, rule.pattern);
  if (patternError) return { ok: false, message: patternError };

  const userId = await getCurrentUserId();
  const preview = await previewRuleAgainstRecentItems(userId, rule);
  const matched = preview.matches.length;
  const message =
    preview.sampleSize === 0
      ? "No recent articles are available to test."
      : `${matched} of ${preview.sampleSize} recent article${preview.sampleSize === 1 ? "" : "s"} would match.`;
  return { ok: true, message, action: rule.action, ...preview };
}

export async function deleteRuleAction(formData: FormData): Promise<void> {
  const ruleId = Number(formData.get("ruleId"));
  if (!Number.isInteger(ruleId)) return;
  const userId = await getCurrentUserId();
  await deleteRule(userId, ruleId);
  revalidatePath("/rules");
}

export async function toggleRuleAction(formData: FormData): Promise<void> {
  const ruleId = Number(formData.get("ruleId"));
  const enabled = formData.get("enabled") === "true";
  if (!Number.isInteger(ruleId)) return;
  const userId = await getCurrentUserId();
  await setRuleEnabled(userId, ruleId, enabled);
  revalidatePath("/rules");
}

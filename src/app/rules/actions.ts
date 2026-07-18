"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCurrentUser, getCurrentUserId } from "@/lib/current-user";
import { listLabels } from "@/lib/labels";
import {
  applyRuleToExistingItems,
  createRule,
  deleteRule,
  getRule,
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

export interface RuleApplyState extends RuleActionState {
  matched?: number;
  scanned?: number;
  hasMore?: boolean;
}

const newRuleSchema = z.object({
  feedId: z.coerce.number().int().positive().nullable(),
  field: z.enum(RULE_FIELDS),
  matchType: z.enum(RULE_MATCH_TYPES),
  pattern: z.string(),
  action: z.enum(RULE_ACTIONS),
  labelId: z.coerce.number().int().positive().nullable(),
});

function parseNewRule(formData: FormData) {
  const rawFeedId = String(formData.get("feedId") ?? "");
  const rawLabelId = String(formData.get("labelId") ?? "");
  return newRuleSchema.safeParse({
    feedId: rawFeedId === "all" || rawFeedId === "" ? null : rawFeedId,
    field: formData.get("field"),
    matchType: formData.get("matchType"),
    pattern: String(formData.get("pattern") ?? "").trim(),
    action: formData.get("action"),
    labelId: rawLabelId === "" ? null : rawLabelId,
  });
}

async function validateRule(
  userId: number,
  rule: z.infer<typeof newRuleSchema>,
): Promise<string | null> {
  const patternError = validatePattern(rule.matchType, rule.pattern);
  if (patternError) return patternError;
  if (rule.action !== "tag") return null;
  if (rule.labelId === null) return "Choose a label to apply.";

  const labels = await listLabels(userId);
  return labels.some((label) => label.id === rule.labelId)
    ? null
    : "That label is no longer available.";
}

export async function createRuleAction(
  _prev: RuleActionState,
  formData: FormData,
): Promise<RuleActionState> {
  const parsed = parseNewRule(formData);
  if (!parsed.success) return { ok: false, message: "Invalid rule input." };

  const userId = await getCurrentUserId();
  const validationError = await validateRule(userId, parsed.data);
  if (validationError) return { ok: false, message: validationError };
  await createRule(userId, parsed.data);

  revalidatePath("/rules");
  revalidatePath("/");
  return { ok: true, message: "Rule created." };
}

const ruleIdSchema = z.coerce.number().int().positive();

/** Apply an already-saved, still-enabled rule after an explicit user confirm. */
export async function applyRuleToExistingAction(
  _prev: RuleApplyState,
  formData: FormData,
): Promise<RuleApplyState> {
  const ruleId = ruleIdSchema.safeParse(formData.get("ruleId"));
  if (!ruleId.success) return { ok: false, message: "Invalid rule." };

  const user = await getCurrentUser();
  const userId = user.id;
  const rule = await getRule(userId, ruleId.data);
  if (!rule) return { ok: false, message: "That rule is no longer available." };
  if (!rule.enabled) {
    return { ok: false, message: "Enable the rule before applying it." };
  }

  const result = await applyRuleToExistingItems(
    userId,
    rule,
    user.settings.inAppRuleAlerts !== false,
  );
  revalidatePath("/rules");
  revalidatePath("/");
  const notificationMessage =
    rule.action === "notify"
      ? user.settings.inAppRuleAlerts !== false
        ? " Matching articles were added to Notifications."
        : " Notifications are disabled in Settings."
      : "";
  return {
    ok: true,
    message: `Applied to ${result.matched} matching article${result.matched === 1 ? "" : "s"} from ${result.scanned} scanned.${notificationMessage}`,
    ...result,
  };
}

export async function previewRuleAction(
  _prev: RulePreviewState,
  formData: FormData,
): Promise<RulePreviewState> {
  const parsed = parseNewRule(formData);
  if (!parsed.success) return { ok: false, message: "Invalid rule input." };

  const userId = await getCurrentUserId();
  const validationError = await validateRule(userId, parsed.data);
  if (validationError) return { ok: false, message: validationError };
  const preview = await previewRuleAgainstRecentItems(userId, parsed.data);
  const matched = preview.matches.length;
  const message =
    preview.sampleSize === 0
      ? "No recent articles are available to test."
      : `${matched} of ${preview.sampleSize} recent article${preview.sampleSize === 1 ? "" : "s"} would match.`;
  return { ok: true, message, action: parsed.data.action, ...preview };
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

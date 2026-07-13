import { BackLink } from "@/components/back-link";
import { ConfirmButton } from "@/components/confirm-button";
import { RuleForm } from "@/components/rule-form";
import { Button } from "@/components/ui/button";
import { getCurrentUserId } from "@/lib/current-user";
import { listLabels } from "@/lib/labels";
import { listFeeds } from "@/lib/reader";
import { listRules, type RuleListEntry } from "@/lib/rules";
import { deleteRuleAction, toggleRuleAction } from "./actions";

const ACTION_LABEL: Record<string, string> = {
  mute: "mute",
  mark_read: "mark read",
  star: "star",
  tag: "apply label",
};

function describe(rule: RuleListEntry): string {
  const scope = rule.feedId ? (rule.feedTitle ?? "one feed") : "all feeds";
  const match = rule.matchType === "regex" ? "matches" : "contains";
  const action =
    rule.action === "tag" && rule.labelName
      ? `apply label “${rule.labelName}”`
      : ACTION_LABEL[rule.action];
  return `In ${scope}, when ${rule.field} ${match} “${rule.pattern}” → ${action}`;
}

export default async function RulesPage() {
  const userId = await getCurrentUserId();
  const [rules, feeds, labels] = await Promise.all([
    listRules(userId),
    listFeeds(userId),
    listLabels(userId),
  ]);

  return (
    <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="font-serif text-2xl font-bold tracking-tight">Rules</h1>
        <BackLink />
      </div>

      <div className="space-y-6">
        <RuleForm
          feeds={feeds.map((f) => ({
            feedId: f.feedId,
            title: f.title ?? f.url,
          }))}
          labels={labels}
        />

        {rules.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No rules yet. Rules run on new articles as they arrive — mute the
            noise, star what matters, and label what you want to keep.
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-lg border">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex flex-wrap items-center gap-2 px-4 py-3"
              >
                <span
                  className={`min-w-0 flex-1 text-sm ${rule.enabled ? "" : "text-muted-foreground line-through"}`}
                >
                  {describe(rule)}
                </span>

                <form action={toggleRuleAction}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <input
                    type="hidden"
                    name="enabled"
                    value={rule.enabled ? "false" : "true"}
                  />
                  <Button type="submit" variant="outline" size="sm">
                    {rule.enabled ? "Disable" : "Enable"}
                  </Button>
                </form>

                <form action={deleteRuleAction}>
                  <input type="hidden" name="ruleId" value={rule.id} />
                  <ConfirmButton
                    message={`Delete this rule? Articles it already affected keep their state.`}
                  >
                    Delete
                  </ConfirmButton>
                </form>
              </li>
            ))}
          </ul>
        )}

        <p className="text-xs text-muted-foreground">
          Rules apply to new articles as they arrive, and optionally to existing
          ones when created. Deleting or disabling a rule doesn't undo what it
          already did.
        </p>
      </div>
    </div>
  );
}

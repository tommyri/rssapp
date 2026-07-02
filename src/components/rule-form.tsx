"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { createRuleAction, type RuleActionState } from "@/app/rules/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: RuleActionState = { ok: true, message: "" };

const selectClass =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Adding…" : "Add rule"}
    </Button>
  );
}

export function RuleForm({
  feeds,
}: {
  feeds: { feedId: number; title: string }[];
}) {
  const [state, formAction] = useActionState(createRuleAction, initial);

  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span>In</span>
        <select name="feedId" defaultValue="all" className={selectClass}>
          <option value="all">all feeds</option>
          {feeds.map((f) => (
            <option key={f.feedId} value={f.feedId}>
              {f.title}
            </option>
          ))}
        </select>

        <span>when</span>
        <select name="field" defaultValue="title" className={selectClass}>
          <option value="title">title</option>
          <option value="content">content</option>
          <option value="author">author</option>
        </select>

        <select
          name="matchType"
          defaultValue="contains"
          className={selectClass}
        >
          <option value="contains">contains</option>
          <option value="regex">matches regex</option>
        </select>

        <Input
          name="pattern"
          placeholder="keyword or pattern"
          aria-label="Pattern"
          autoComplete="off"
          className="h-8 w-56"
        />

        <span>then</span>
        <select name="action" defaultValue="mute" className={selectClass}>
          <option value="mute">mute</option>
          <option value="mark_read">mark read</option>
          <option value="star">star</option>
        </select>
      </div>

      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input type="checkbox" name="applyExisting" defaultChecked />
          Apply to existing articles
        </label>
        <SubmitButton />
        {state.message ? (
          <span
            className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
          >
            {state.message}
          </span>
        ) : null}
      </div>
    </form>
  );
}

"use client";

import { useActionState } from "react";
import {
  createRuleAction,
  previewRuleAction,
  type RuleActionState,
  type RulePreviewState,
} from "@/app/rules/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: RuleActionState = { ok: true, message: "" };
const initialPreview: RulePreviewState = { ok: true, message: "" };

const selectClass =
  "border-input h-8 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50";

function SubmitButton({
  pending,
  disabled,
}: {
  pending: boolean;
  disabled: boolean;
}) {
  return (
    <Button type="submit" size="sm" disabled={disabled}>
      {pending ? "Adding…" : "Add rule"}
    </Button>
  );
}

export function RuleForm({
  feeds,
}: {
  feeds: { feedId: number; title: string }[];
}) {
  const [state, formAction, createPending] = useActionState(
    createRuleAction,
    initial,
  );
  const [preview, previewAction, previewPending] = useActionState(
    previewRuleAction,
    initialPreview,
  );

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
        <Button
          type="submit"
          formAction={previewAction}
          variant="outline"
          size="sm"
          disabled={createPending || previewPending}
        >
          {previewPending ? "Testing…" : "Test rule"}
        </Button>
        <SubmitButton
          pending={createPending}
          disabled={createPending || previewPending}
        />
        {state.message ? (
          <span
            className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
          >
            {state.message}
          </span>
        ) : null}
      </div>

      {preview.message ? (
        <section
          aria-live="polite"
          className={`space-y-2 rounded-md border p-3 text-sm ${preview.ok ? "border-border bg-muted/40" : "border-destructive/40 text-destructive"}`}
        >
          <p>
            {preview.message}
            {preview.ok && preview.action
              ? ` The rule would ${
                  preview.action === "mute"
                    ? "mute matching articles"
                    : preview.action === "mark_read"
                      ? "mark matching articles read"
                      : "star matching articles"
                }.`
              : ""}
          </p>
          {preview.ok && preview.matches && preview.matches.length > 0 ? (
            <ul className="space-y-1.5 border-t border-border/60 pt-2 text-muted-foreground">
              {preview.matches.slice(0, 8).map((match) => (
                <li key={match.id} className="min-w-0">
                  <span className="block truncate text-foreground">
                    {match.title ?? "Untitled article"}
                  </span>
                  <span className="block truncate text-xs">
                    {[match.feedTitle, match.author]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </li>
              ))}
              {preview.matches.length > 8 ? (
                <li className="text-xs">
                  And {preview.matches.length - 8} more.
                </li>
              ) : null}
            </ul>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}

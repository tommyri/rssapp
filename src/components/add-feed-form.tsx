"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, addFeedAction } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const initial: ActionState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending} className="shrink-0">
      {pending ? "…" : "Add"}
    </Button>
  );
}

export function AddFeedForm() {
  const [state, formAction] = useActionState(addFeedAction, initial);
  return (
    <form action={formAction} className="space-y-1.5">
      <div className="flex gap-2">
        <Input
          name="url"
          type="text"
          placeholder="Add feed or site URL"
          aria-label="Feed or site URL"
          autoComplete="off"
          className="h-8 bg-background text-sm"
        />
        <SubmitButton />
      </div>
      {state.message ? (
        <p
          className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

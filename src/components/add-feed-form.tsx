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
    <Button type="submit" disabled={pending}>
      {pending ? "Adding…" : "Add"}
    </Button>
  );
}

export function AddFeedForm() {
  const [state, formAction] = useActionState(addFeedAction, initial);
  return (
    <form action={formAction} className="space-y-2">
      <div className="flex gap-2">
        <Input
          name="url"
          type="text"
          placeholder="Feed or site URL"
          aria-label="Feed or site URL"
          autoComplete="off"
        />
        <SubmitButton />
      </div>
      {state.message ? (
        <p
          className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

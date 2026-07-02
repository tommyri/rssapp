"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, refreshAction } from "@/app/actions";
import { Button } from "@/components/ui/button";

const initial: ActionState = { ok: true, message: "" };

function Inner() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Refreshing…" : "Refresh all"}
    </Button>
  );
}

export function RefreshButton() {
  const [state, formAction] = useActionState(refreshAction, initial);
  return (
    <form action={formAction} className="flex items-center gap-2">
      <Inner />
      {state.message ? (
        <span className="text-xs text-muted-foreground">{state.message}</span>
      ) : null}
    </form>
  );
}

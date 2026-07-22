"use client";

import { RefreshCwIcon } from "lucide-react";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type ActionState, refreshAction } from "@/app/actions";

const initial: ActionState = { ok: true, message: "" };

function Inner() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      title="Refresh all feeds"
      className="inline-flex items-center gap-1.5 rounded-md border border-border/70 px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent/60 hover:text-foreground disabled:opacity-50"
    >
      <RefreshCwIcon className={`size-3.5 ${pending ? "animate-spin" : ""}`} />
      {pending ? "Refreshing…" : "Refresh"}
    </button>
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

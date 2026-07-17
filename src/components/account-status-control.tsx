"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type AccountStatusActionState,
  setAccountStatusAction,
} from "@/app/admin/accounts/actions";
import { Button } from "@/components/ui/button";
import type { AccountStatus } from "@/db/schema";

const initial: AccountStatusActionState = { ok: true, message: "" };

function SubmitButton({ status }: { status: AccountStatus }) {
  const { pending } = useFormStatus();
  const suspend = status === "active";
  return (
    <Button
      type="submit"
      variant={suspend ? "destructive" : "outline"}
      size="sm"
      disabled={pending}
    >
      {pending ? "Updating…" : suspend ? "Suspend access" : "Restore access"}
    </Button>
  );
}

export function AccountStatusControl({
  accountId,
  status,
}: {
  accountId: number;
  status: AccountStatus;
}) {
  const [state, formAction] = useActionState(setAccountStatusAction, initial);
  const nextStatus = status === "active" ? "suspended" : "active";
  const suspend = status === "active";

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1.5"
      onSubmit={(event) => {
        if (
          suspend &&
          !window.confirm(
            "Suspend this account? They will be signed out immediately.",
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <input type="hidden" name="status" value={nextStatus} />
      <SubmitButton status={status} />
      {state.message ? (
        <p
          aria-live="polite"
          className={`max-w-48 text-right text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

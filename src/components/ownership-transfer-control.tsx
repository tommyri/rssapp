"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type OwnershipTransferActionState,
  transferOwnershipAction,
} from "@/app/admin/accounts/actions";
import { Button } from "@/components/ui/button";

const initial: OwnershipTransferActionState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Transferring…" : "Make owner"}
    </Button>
  );
}

export function OwnershipTransferControl({
  accountId,
  email,
}: {
  accountId: number;
  email: string;
}) {
  const [state, formAction] = useActionState(transferOwnershipAction, initial);

  return (
    <form
      action={formAction}
      className="flex flex-col items-end gap-1.5"
      onSubmit={(event) => {
        if (
          !window.confirm(
            `Make ${email} the deployment owner? You will be signed out and lose access to this console.`,
          )
        ) {
          event.preventDefault();
        }
      }}
    >
      <input type="hidden" name="accountId" value={accountId} />
      <SubmitButton />
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

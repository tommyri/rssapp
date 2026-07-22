"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type AccountInviteActionState,
  revokeAccountInviteAction,
} from "@/app/admin/accounts/actions";
import { Button } from "@/components/ui/button";

const initial: AccountInviteActionState = { ok: true, message: "" };

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="ghost" size="sm" disabled={pending}>
      {pending ? "Revoking…" : "Revoke"}
    </Button>
  );
}

export function AccountInviteRevokeControl({
  invitationId,
}: {
  invitationId: number;
}) {
  const [state, formAction] = useActionState(
    revokeAccountInviteAction,
    initial,
  );

  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="invitationId" value={invitationId} />
      <SubmitButton />
      {state.message ? (
        <p
          aria-live="polite"
          className={`max-w-44 text-right text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
        >
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

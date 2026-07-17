"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type AccountInviteActionState,
  issueAccountInviteAction,
  type RegistrationPolicyActionState,
  setRegistrationModeAction,
} from "@/app/admin/accounts/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RegistrationMode } from "@/db/schema";

const policyInitial: RegistrationPolicyActionState = { ok: true, message: "" };
const inviteInitial: AccountInviteActionState = { ok: true, message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" size="sm" disabled={pending}>
      {pending ? "Working…" : label}
    </Button>
  );
}

function Message({
  state,
}: {
  state: RegistrationPolicyActionState | AccountInviteActionState;
}) {
  if (!state.message) return null;
  return (
    <p
      aria-live="polite"
      className={`text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

export function AccountAccessControls({
  registrationMode,
}: {
  registrationMode: RegistrationMode;
}) {
  const [policyState, policyAction] = useActionState(
    setRegistrationModeAction,
    policyInitial,
  );
  const [inviteState, inviteAction] = useActionState(
    issueAccountInviteAction,
    inviteInitial,
  );

  return (
    <div className="grid gap-5 md:grid-cols-2">
      <form action={policyAction} className="space-y-2">
        <label htmlFor="registration-mode" className="text-sm font-medium">
          Who can create an account?
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <select
            id="registration-mode"
            name="registrationMode"
            defaultValue={registrationMode}
            className="border-input h-9 rounded-md border bg-transparent px-2 text-sm shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <option value="open">Anyone (public signup)</option>
            <option value="invite_only">People with an invitation</option>
            <option value="closed">No new accounts</option>
          </select>
          <SubmitButton label="Update access" />
        </div>
        <Message state={policyState} />
      </form>

      <form action={inviteAction} className="space-y-2">
        <label htmlFor="invite-email" className="text-sm font-medium">
          Invite someone
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="invite-email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="person@example.com"
            className="h-9 min-w-52 flex-1"
            required
          />
          <SubmitButton label="Send invitation" />
        </div>
        <p className="text-xs text-muted-foreground">
          The person receives a one-time signup link that expires in 7 days.
        </p>
        <Message state={inviteState} />
      </form>
    </div>
  );
}

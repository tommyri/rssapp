"use client";

import { useActionState, useState } from "react";
import { useFormStatus } from "react-dom";
import {
  type AccountActionState,
  changeEmailAction,
  changePasswordAction,
  updateReadingPrefsAction,
} from "@/app/settings/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DEFAULT_AUTO_READ_DAYS } from "@/lib/reading-prefs";

const initial: AccountActionState = { ok: true, message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" variant="outline" size="sm" disabled={pending}>
      {pending ? "Saving…" : label}
    </Button>
  );
}

function Message({ state }: { state: AccountActionState }) {
  if (!state.message) return null;
  return (
    <p
      className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, formAction] = useActionState(changeEmailAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Email</h2>
      <div className="space-y-2">
        <Label htmlFor="email">New email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={currentEmail}
          autoComplete="email"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="email-current">Current password</Label>
        <Input
          id="email-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <SubmitButton label="Change email" />
      <Message state={state} />
    </form>
  );
}

export function ReadingPrefsForm({
  autoReadDays,
}: {
  autoReadDays: number | null;
}) {
  const [state, formAction] = useActionState(updateReadingPrefsAction, initial);
  // Controlled so React 19's post-action form reset doesn't revert what the
  // user just typed (the value is saved, but an uncontrolled field would snap
  // back to its stale defaultValue).
  const [days, setDays] = useState(
    autoReadDays == null
      ? String(DEFAULT_AUTO_READ_DAYS)
      : String(autoReadDays),
  );
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Reading</h2>
      <div className="space-y-2">
        <Label htmlFor="autoReadDays">
          Auto-mark articles read after (days)
        </Label>
        <Input
          id="autoReadDays"
          name="autoReadDays"
          type="number"
          min={1}
          max={365}
          value={days}
          onChange={(e) => setDays(e.target.value)}
          placeholder={String(DEFAULT_AUTO_READ_DAYS)}
          className="w-28"
        />
        <p className="text-xs text-muted-foreground">
          Applies to every feed unless you override it per feed on the Manage
          feeds page. Leave empty to use the {DEFAULT_AUTO_READ_DAYS}-day
          default.
        </p>
      </div>
      <SubmitButton label="Save" />
      <Message state={state} />
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, formAction] = useActionState(changePasswordAction, initial);
  return (
    <form action={formAction} className="space-y-3 rounded-lg border p-4">
      <h2 className="font-medium">Password</h2>
      <div className="space-y-2">
        <Label htmlFor="pw-current">Current password</Label>
        <Input
          id="pw-current"
          name="currentPassword"
          type="password"
          autoComplete="current-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-new">New password</Label>
        <Input
          id="pw-new"
          name="newPassword"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="pw-confirm">Confirm new password</Label>
        <Input
          id="pw-confirm"
          name="confirm"
          type="password"
          autoComplete="new-password"
          required
        />
      </div>
      <SubmitButton label="Change password" />
      <Message state={state} />
    </form>
  );
}

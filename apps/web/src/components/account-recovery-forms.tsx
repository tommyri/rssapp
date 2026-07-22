"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import {
  type RecoveryActionState,
  requestPasswordResetAction,
} from "@/app/forgot-password/actions";
import {
  type ResetPasswordActionState,
  resetPasswordAction,
} from "@/app/reset-password/actions";
import {
  type VerifyEmailActionState,
  verifyEmailAction,
} from "@/app/verify-email/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial = { ok: true, message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

function Message({
  state,
}: {
  state:
    | RecoveryActionState
    | ResetPasswordActionState
    | VerifyEmailActionState;
}) {
  if (!state.message) return null;
  return (
    <p
      className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}
    >
      {state.message}
    </p>
  );
}

export function ForgotPasswordForm() {
  const [state, formAction] = useActionState(
    requestPasswordResetAction,
    initial,
  );
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          Reset password
        </h1>
        <p className="text-sm text-muted-foreground">
          We’ll send a one-time reset link if this address has an active
          account.
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="recovery-email">Email</Label>
          <Input
            id="recovery-email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <SubmitButton label="Send reset link" />
        <Message state={state} />
      </form>
      <Link
        href="/login"
        className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
      >
        Back to sign in
      </Link>
    </div>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(resetPasswordAction, initial);
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          Set a new password
        </h1>
        <p className="text-sm text-muted-foreground">
          This signs out any existing sessions for your account.
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <Label htmlFor="reset-password">New password</Label>
          <Input
            id="reset-password"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="reset-confirm">Confirm new password</Label>
          <Input
            id="reset-confirm"
            name="confirm"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
          />
        </div>
        <SubmitButton label="Reset password" />
        <Message state={state} />
        {state.ok && state.message ? (
          <Link
            href="/login"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Continue to sign in
          </Link>
        ) : null}
      </form>
    </div>
  );
}

export function VerifyEmailForm({ token }: { token: string }) {
  const [state, formAction] = useActionState(verifyEmailAction, initial);
  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          Verify your email
        </h1>
        <p className="text-sm text-muted-foreground">
          Confirm this address to secure your account.
        </p>
      </div>
      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <SubmitButton label="Verify email" />
        <Message state={state} />
        {state.ok && state.message ? (
          <Link
            href="/login"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Go to sign in
          </Link>
        ) : null}
      </form>
    </div>
  );
}

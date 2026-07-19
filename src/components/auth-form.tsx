"use client";

import Link from "next/link";
import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { type AuthActionState, loginAction } from "@/app/login/actions";
import { signUpAction } from "@/app/signup/actions";
import { GoogleAuthButton } from "@/components/google-auth-controls";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const initial: AuthActionState = { error: "", message: "" };

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" className="w-full" disabled={pending}>
      {pending ? "…" : label}
    </Button>
  );
}

export function AuthForm({
  mode,
  notice,
  inviteToken,
  googleEnabled,
  returnTo,
}: {
  mode: "login" | "signup";
  notice?: string;
  inviteToken?: string;
  googleEnabled: boolean;
  returnTo?: string;
}) {
  const isSignup = mode === "signup";
  const [state, formAction] = useActionState(
    isSignup ? signUpAction : loginAction,
    initial,
  );

  return (
    <div className="w-full max-w-sm space-y-6">
      <div className="space-y-1 text-center">
        <h1 className="font-serif text-3xl font-bold tracking-tight">
          rssapp<span className="text-primary">.</span>
        </h1>
        <p className="text-sm text-muted-foreground">
          {isSignup
            ? "Create your account to get started."
            : "Sign in to your reader."}
        </p>
      </div>

      <form action={formAction} className="space-y-4">
        {!isSignup && returnTo ? (
          <input type="hidden" name="returnTo" value={returnTo} />
        ) : null}
        {isSignup && inviteToken ? (
          <input type="hidden" name="invite" value={inviteToken} />
        ) : null}
        <div className="space-y-2">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Password</Label>
          <Input
            id="password"
            name="password"
            type="password"
            autoComplete={isSignup ? "new-password" : "current-password"}
            required
          />
        </div>
        {state.error ? (
          <p className="text-sm text-destructive">{state.error}</p>
        ) : null}
        {notice ? (
          <p className="text-sm text-muted-foreground">{notice}</p>
        ) : null}
        {state.message ? (
          <p className="text-sm text-muted-foreground">{state.message}</p>
        ) : null}
        <SubmitButton label={isSignup ? "Create account" : "Sign in"} />
      </form>
      {googleEnabled ? (
        <div className="space-y-4">
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span className="h-px flex-1 bg-border" />
            <span>or</span>
            <span className="h-px flex-1 bg-border" />
          </div>
          <GoogleAuthButton
            mode={mode}
            inviteToken={inviteToken}
            returnTo={returnTo}
          />
        </div>
      ) : null}
      {!isSignup ? (
        <div className="space-y-3">
          <Link
            href="/forgot-password"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Forgot your password?
          </Link>
          <Link
            href="/signup"
            className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Create an account
          </Link>
        </div>
      ) : (
        <Link
          href="/login"
          className="block text-center text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
        >
          Already have an account? Sign in
        </Link>
      )}
    </div>
  );
}

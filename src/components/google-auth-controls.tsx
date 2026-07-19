"use client";

import { useFormStatus } from "react-dom";
import {
  beginGoogleLinkAction,
  beginGoogleSignInAction,
  beginGoogleSignupAction,
} from "@/app/google-auth-actions";
import { Button } from "@/components/ui/button";

function GoogleSubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button
      type="submit"
      variant="outline"
      className="w-full"
      disabled={pending}
    >
      {pending ? "Opening Google…" : label}
    </Button>
  );
}

export function GoogleAuthButton({
  mode,
  inviteToken,
  returnTo,
}: {
  mode: "login" | "signup";
  inviteToken?: string;
  returnTo?: string;
}) {
  if (mode === "login") {
    return (
      <form action={beginGoogleSignInAction}>
        {returnTo ? (
          <input type="hidden" name="returnTo" value={returnTo} />
        ) : null}
        <GoogleSubmitButton label="Continue with Google" />
      </form>
    );
  }

  return (
    <form action={beginGoogleSignupAction}>
      {inviteToken ? (
        <input type="hidden" name="invite" value={inviteToken} />
      ) : null}
      <GoogleSubmitButton label="Continue with Google" />
    </form>
  );
}

export function GoogleAccountLink({
  connected,
  hasPassword,
  notice,
}: {
  connected: boolean;
  hasPassword: boolean;
  notice?: string;
}) {
  return (
    <section className="space-y-3 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Google sign-in</h3>
        <p className="text-xs text-muted-foreground">
          {connected
            ? hasPassword
              ? "Google is connected to this account. You can sign in with either Google or your password."
              : "Google is connected to this account. Set a password below if you would also like password sign-in."
            : "Connect Google to sign in without entering your password. Your account is never linked by email alone."}
        </p>
      </div>
      {notice ? (
        <p className="text-sm text-muted-foreground">{notice}</p>
      ) : null}
      {connected ? (
        <p className="text-sm text-muted-foreground">Connected</p>
      ) : (
        <form action={beginGoogleLinkAction}>
          <GoogleSubmitButton label="Connect Google" />
        </form>
      )}
    </section>
  );
}

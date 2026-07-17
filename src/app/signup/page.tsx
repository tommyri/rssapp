import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getRegistrationMode } from "@/lib/account-invitations";
import { getOptionalCurrentUser } from "@/lib/current-user";
import {
  googleAuthNotice,
  isGoogleAuthEnabled,
} from "@/lib/google-auth-config";

export default async function SignupPage({
  searchParams,
}: {
  searchParams: Promise<{ invite?: string; google?: string }>;
}) {
  const user = await getOptionalCurrentUser();
  if (user) redirect("/");
  const [registrationMode, params] = await Promise.all([
    getRegistrationMode(),
    searchParams,
  ]);

  if (registrationMode === "closed") {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Registrations are closed
          </h1>
          <p className="text-sm text-muted-foreground">
            This reader is not accepting new accounts right now.
          </p>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign in to an existing account
          </Link>
        </div>
      </div>
    );
  }

  if (registrationMode === "invite_only" && !params.invite) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Invitation required
          </h1>
          <p className="text-sm text-muted-foreground">
            This reader is accepting accounts by invitation. Open the link in
            your invitation email to continue.
          </p>
          <Link
            href="/login"
            className="text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sign in to an existing account
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm
        mode="signup"
        inviteToken={params.invite}
        notice={
          registrationMode === "invite_only"
            ? "Create your account using this invitation."
            : googleAuthNotice(params.google)
        }
        googleEnabled={isGoogleAuthEnabled()}
      />
    </div>
  );
}

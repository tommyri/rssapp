import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getOptionalCurrentUser } from "@/lib/current-user";
import {
  googleAuthNotice,
  isGoogleAuthEnabled,
} from "@/lib/google-auth-config";

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; owner?: string; google?: string }>;
}) {
  // Already signed in? Go straight to the reader.
  // Use the same database-backed account check as the reader. A pre-lifecycle
  // JWT can contain a user id but no session version; redirecting that stale
  // session to / would otherwise bounce forever between / and /login.
  const user = await getOptionalCurrentUser();
  if (user) redirect("/");
  const params = await searchParams;
  const notice =
    params.notice === "account-deleted"
      ? "Your account and reader data have been deleted."
      : params.notice === "ownership-transferred" && params.owner
        ? `${params.owner} is now the deployment owner. Please sign in again.`
        : googleAuthNotice(params.google);

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm
        mode="login"
        notice={notice}
        googleEnabled={isGoogleAuthEnabled()}
      />
    </div>
  );
}

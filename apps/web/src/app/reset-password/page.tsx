import Link from "next/link";
import { ResetPasswordForm } from "@/components/account-recovery-forms";
import { isAccountTokenSecret } from "@/lib/account-tokens";

export default async function ResetPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token ?? "";
  if (!isAccountTokenSecret(token)) {
    return (
      <div className="flex flex-1 items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm space-y-4 text-center">
          <h1 className="font-serif text-3xl font-bold tracking-tight">
            Reset link unavailable
          </h1>
          <p className="text-sm text-muted-foreground">
            Request a new password reset link to continue.
          </p>
          <Link
            href="/forgot-password"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Request a new link
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <ResetPasswordForm token={token} />
    </div>
  );
}

import Link from "next/link";
import { VerifyEmailForm } from "@/components/account-recovery-forms";
import { isAccountTokenSecret } from "@/lib/account-tokens";

export default async function VerifyEmailPage({
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
            Verification link unavailable
          </h1>
          <p className="text-sm text-muted-foreground">
            Sign in to request another verification email.
          </p>
          <Link
            href="/login"
            className="text-sm text-primary underline-offset-4 hover:underline"
          >
            Go to sign in
          </Link>
        </div>
      </div>
    );
  }
  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <VerifyEmailForm token={token} />
    </div>
  );
}

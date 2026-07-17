import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getOptionalCurrentUser } from "@/lib/current-user";

export default async function LoginPage() {
  // Already signed in? Go straight to the reader.
  // Use the same database-backed account check as the reader. A pre-lifecycle
  // JWT can contain a user id but no session version; redirecting that stale
  // session to / would otherwise bounce forever between / and /login.
  const user = await getOptionalCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm mode="login" />
    </div>
  );
}

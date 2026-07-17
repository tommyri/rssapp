import { redirect } from "next/navigation";
import { AuthForm } from "@/components/auth-form";
import { getOptionalCurrentUser } from "@/lib/current-user";

export default async function SignupPage() {
  const user = await getOptionalCurrentUser();
  if (user) redirect("/");

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm mode="signup" />
    </div>
  );
}

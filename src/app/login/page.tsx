import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { AuthForm } from "@/components/auth-form";
import { hasAnyUser } from "./actions";

export default async function LoginPage() {
  // Already signed in? Go straight to the reader.
  const session = await auth();
  if (session?.user) redirect("/");

  const mode = (await hasAnyUser()) ? "login" : "register";

  return (
    <div className="flex flex-1 items-center justify-center px-4 py-16">
      <AuthForm mode={mode} />
    </div>
  );
}

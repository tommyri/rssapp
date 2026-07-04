import { redirect } from "next/navigation";
import { auth } from "@/auth";

/**
 * The session user's id. Every user-scoped query in the app goes through here
 * (docs/business-option.md) — this used to be a single-user shim; wiring in
 * Auth.js was a change to this one function. The proxy already gates the app,
 * so a missing session here means something slipped through — send them to login.
 */
export async function getCurrentUserId(): Promise<number> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  if (!id) redirect("/login");
  return Number(id);
}

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

/**
 * Like getCurrentUserId, but null instead of a redirect when signed out. Only
 * for surfaces that render on both sides of the login wall (the root layout's
 * command palette) — user-scoped queries keep going through getCurrentUserId.
 */
export async function getOptionalUserId(): Promise<number | null> {
  const session = await auth();
  const id = (session?.user as { id?: string } | undefined)?.id;
  return id ? Number(id) : null;
}

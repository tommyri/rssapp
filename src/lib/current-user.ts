import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { db } from "@/db";
import { users } from "@/db/schema";

type SessionIdentity = { id?: string; sessionVersion?: number };

/**
 * Resolve a session to a current account on every protected server request.
 * JWT presence alone is not authorization: this rejects suspended accounts and
 * sessions revoked by a password reset.
 */
export async function getOptionalCurrentUser() {
  const session = await auth();
  const identity = session?.user as SessionIdentity | undefined;
  const id = Number(identity?.id);
  const sessionVersion = identity?.sessionVersion;
  if (
    !Number.isSafeInteger(id) ||
    id < 1 ||
    typeof sessionVersion !== "number" ||
    !Number.isInteger(sessionVersion)
  ) {
    return null;
  }

  const user = await db.query.users.findFirst({
    where: and(
      eq(users.id, id),
      eq(users.status, "active"),
      eq(users.sessionVersion, sessionVersion),
    ),
  });
  return user ?? null;
}

/**
 * The session user's id. Every user-scoped query in the app goes through here
 * (docs/business-option.md) — this used to be a single-user shim; wiring in
 * Auth.js was a change to this one function. The proxy already gates the app,
 * so a missing session here means something slipped through — send them to login.
 */
export async function getCurrentUserId(): Promise<number> {
  const user = await getOptionalCurrentUser();
  if (!user) redirect("/login");
  return user.id;
}

/**
 * Like getCurrentUserId, but null instead of a redirect when signed out. Only
 * for surfaces that render on both sides of the login wall (the root layout's
 * command palette) — user-scoped queries keep going through getCurrentUserId.
 */
export async function getOptionalUserId(): Promise<number | null> {
  const user = await getOptionalCurrentUser();
  return user?.id ?? null;
}

import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  AUTH_RATE_LIMITS,
  clearAuthRateLimit,
  emailRateLimitKey,
} from "@/lib/auth-rate-limit";
import { verifyPassword } from "@/lib/password";

export const { auth, handlers, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(credentials) {
        const email = String(credentials?.email ?? "")
          .toLowerCase()
          .trim();
        const password = String(credentials?.password ?? "");
        if (!email || !password) return null;

        const user = await db.query.users.findFirst({
          where: eq(users.email, email),
        });
        if (
          !user ||
          user.status !== "active" ||
          !user.emailVerifiedAt ||
          !verifyPassword(password, user.passwordHash)
        )
          return null;

        // Successful authentication clears only the address-specific failure
        // bucket; the network bucket continues protecting shared sources.
        await clearAuthRateLimit(
          AUTH_RATE_LIMITS.signInEmail,
          emailRateLimitKey(email),
        );
        await db
          .update(users)
          .set({ lastSignedInAt: new Date() })
          .where(eq(users.id, user.id));

        return {
          id: String(user.id),
          email: user.email,
          sessionVersion: user.sessionVersion,
        };
      },
    }),
  ],
});

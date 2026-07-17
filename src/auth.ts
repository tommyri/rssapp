import { eq } from "drizzle-orm";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import type { GoogleProfile } from "next-auth/providers/google";
import Google from "next-auth/providers/google";
import { authConfig } from "@/auth.config";
import { db } from "@/db";
import { users } from "@/db/schema";
import {
  AUTH_RATE_LIMITS,
  clearAuthRateLimit,
  emailRateLimitKey,
} from "@/lib/auth-rate-limit";
import { createAuthSession } from "@/lib/auth-sessions";
import { completeGoogleAuthentication } from "@/lib/google-auth";
import { googleOAuthCredentials } from "@/lib/google-auth-config";
import { verifyPassword } from "@/lib/password";

const googleCredentials = googleOAuthCredentials();

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
          !user.passwordHash ||
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

        const sessionId = await createAuthSession({
          userId: user.id,
          sessionVersion: user.sessionVersion,
        });

        return {
          id: String(user.id),
          email: user.email,
          sessionVersion: user.sessionVersion,
          sessionId,
        };
      },
    }),
    ...(googleCredentials ? [Google(googleCredentials)] : []),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async signIn({ user, account, profile }) {
      if (account?.provider !== "google") return true;
      const result = await completeGoogleAuthentication(
        profile as GoogleProfile | undefined,
      );
      if (result.kind === "redirect") return result.url;

      // Auth.js is intentionally adapter-free here; binding its JWT user to
      // the local account keeps all account lifecycle enforcement in our own
      // current-user lookup instead of trusting a provider email on later requests.
      Object.assign(user, {
        id: String(result.account.id),
        email: result.account.email,
        sessionVersion: result.account.sessionVersion,
        sessionId: await createAuthSession({
          userId: result.account.id,
          sessionVersion: result.account.sessionVersion,
        }),
      });
      return true;
    },
  },
});

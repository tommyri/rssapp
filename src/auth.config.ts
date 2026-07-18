import type { NextAuthConfig } from "next-auth";
import { AUTH_SESSION_MAX_AGE_SECONDS } from "@/lib/auth-session-config";

// Edge-safe base config: no database, no node:crypto. The proxy builds
// NextAuth from this alone so it stays lightweight; auth.ts extends it
// with the Credentials provider (which touches the DB) for the Node runtime.
export const authConfig = {
  // Dev fallback mirrors src/db/config.ts. Production boot refuses to start
  // without a real AUTH_SECRET (src/instrumentation.ts).
  secret: process.env.AUTH_SECRET || "dev-insecure-secret-change-me",
  trustHost: true,
  session: { strategy: "jwt", maxAge: AUTH_SESSION_MAX_AGE_SECONDS },
  pages: { signIn: "/login" },
  providers: [], // real providers live in auth.ts
  callbacks: {
    // Route protection: everything requires a session except public account
    // auth endpoints. Returning false sends the user to the signIn page.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (
        pathname === "/login" ||
        pathname === "/signup" ||
        pathname === "/forgot-password" ||
        pathname === "/reset-password" ||
        pathname === "/verify-email" ||
        pathname.startsWith("/api/auth") ||
        // Native reader clients authenticate each request with a revocable API
        // credential. Let the route handler verify that credential instead of
        // redirecting a non-browser client to the interactive sign-in page.
        pathname.startsWith("/api/greader") ||
        pathname === "/api/health" ||
        pathname === "/service-worker.js" ||
        pathname === "/manifest.webmanifest" ||
        pathname === "/icon" ||
        pathname === "/apple-icon"
      )
        return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) {
        const credentialsUser = user as {
          id?: string;
          sessionVersion?: number;
          sessionId?: string;
        };
        (token as { id?: string }).id = credentialsUser.id;
        (token as { sessionVersion?: number }).sessionVersion =
          credentialsUser.sessionVersion;
        (token as { sessionId?: string }).sessionId = credentialsUser.sessionId;
      }
      return token;
    },
    session({ session, token }) {
      const credentialsToken = token as {
        id?: string;
        sessionVersion?: number;
        sessionId?: string;
      };
      if (credentialsToken.id && session.user) {
        const user = session.user as {
          id?: string;
          sessionVersion?: number;
          sessionId?: string;
        };
        user.id = credentialsToken.id;
        user.sessionVersion = credentialsToken.sessionVersion;
        user.sessionId = credentialsToken.sessionId;
      }
      return session;
    },
  },
} satisfies NextAuthConfig;

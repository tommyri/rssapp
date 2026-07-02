import type { NextAuthConfig } from "next-auth";

// Edge-safe base config: no database, no node:crypto. The middleware builds
// NextAuth from this alone so it stays in the edge bundle; auth.ts extends it
// with the Credentials provider (which touches the DB) for the Node runtime.
export const authConfig = {
  // Dev fallback mirrors src/db/config.ts. MUST be overridden in production.
  secret: process.env.AUTH_SECRET ?? "dev-insecure-secret-change-me",
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [], // real providers live in auth.ts
  callbacks: {
    // Route protection: everything requires a session except /login and the
    // auth endpoints. Returning false sends the user to the signIn page.
    authorized({ auth, request }) {
      const { pathname } = request.nextUrl;
      if (pathname === "/login" || pathname.startsWith("/api/auth"))
        return true;
      return !!auth?.user;
    },
    jwt({ token, user }) {
      if (user) (token as { id?: string }).id = user.id;
      return token;
    },
    session({ session, token }) {
      const id = (token as { id?: string }).id;
      if (id && session.user) (session.user as { id?: string }).id = id;
      return session;
    },
  },
} satisfies NextAuthConfig;

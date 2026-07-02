import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Built from the edge-safe config only (no DB) so it runs in middleware.
// The `authorized` callback in authConfig decides what requires a session.
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

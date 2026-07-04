import NextAuth from "next-auth";
import { authConfig } from "@/auth.config";

// Built from the edge-safe config only (no DB) so the proxy stays lightweight.
// The `authorized` callback in authConfig decides what requires a session.
export const { auth: proxy } = NextAuth(authConfig);

export default proxy;

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

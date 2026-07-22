import type { NativeAppSessionGrant } from "@/lib/native-app-sessions";

/** Stable wire representation shared by sign-in and refresh responses. */
export function nativeSessionResponse(grant: NativeAppSessionGrant) {
  return {
    data: {
      account: {
        id: String(grant.account.id),
        email: grant.account.email,
        displayName: grant.account.displayName,
      },
      session: {
        accessToken: grant.tokens.accessToken,
        accessTokenExpiresAt: grant.tokens.accessTokenExpiresAt.toISOString(),
        refreshToken: grant.tokens.refreshToken,
        refreshTokenExpiresAt: grant.tokens.refreshTokenExpiresAt.toISOString(),
      },
    },
  };
}

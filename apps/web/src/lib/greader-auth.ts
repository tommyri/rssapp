import {
  type ApiAccessTokenPrincipal,
  authenticateApiAccessToken,
} from "@/lib/api-access-tokens";

/**
 * Google Reader clients send `Authorization: GoogleLogin auth=<credential>`.
 * Bearer is also accepted for direct integrations with the same app password.
 */
export function gReaderCredentialFromAuthorization(
  value: string | null,
): string | null {
  if (!value) return null;
  const bearer = value.match(/^Bearer\s+(.+)$/i);
  if (bearer) return bearer[1]?.trim() || null;
  const googleLogin = value.match(/^GoogleLogin\s+auth=(\S+)$/i);
  return googleLogin?.[1] ?? null;
}

export async function authenticateGReaderRequest(
  request: Request,
): Promise<ApiAccessTokenPrincipal | null> {
  const credential = gReaderCredentialFromAuthorization(
    request.headers.get("authorization"),
  );
  return credential ? authenticateApiAccessToken(credential) : null;
}

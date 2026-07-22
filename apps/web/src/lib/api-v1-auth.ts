import {
  type ApiAccessTokenPrincipal,
  authenticateApiAccessToken,
} from "@/lib/api-access-tokens";

export function bearerCredential(value: string | null): string | null {
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function authenticateFirstPartyApiRequest(
  request: Request,
): Promise<ApiAccessTokenPrincipal | null> {
  const credential = bearerCredential(request.headers.get("authorization"));
  return credential ? authenticateApiAccessToken(credential) : null;
}

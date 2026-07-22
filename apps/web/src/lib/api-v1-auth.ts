import {
  type ApiAccessTokenPrincipal,
  authenticateApiAccessToken,
} from "@/lib/api-access-tokens";
import {
  authenticateNativeAccessToken,
  isNativeAccessToken,
} from "@/lib/native-app-sessions";

export function bearerCredential(value: string | null): string | null {
  const match = value?.match(/^Bearer\s+(\S+)$/i);
  return match?.[1] ?? null;
}

export async function authenticateFirstPartyApiRequest(
  request: Request,
): Promise<ApiAccessTokenPrincipal | null> {
  const credential = bearerCredential(request.headers.get("authorization"));
  if (!credential) return null;

  // Currentfold-owned clients use short-lived native sessions. Long-lived app
  // credentials remain accepted for compatibility clients and internal tools.
  if (isNativeAccessToken(credential)) {
    return authenticateNativeAccessToken(credential);
  }
  return authenticateApiAccessToken(credential);
}

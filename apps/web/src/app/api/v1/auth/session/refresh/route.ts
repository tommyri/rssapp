import { z } from "zod";
import { apiError, apiJson } from "@/lib/api-v1-response";
import { rotateNativeAppSession } from "@/lib/native-app-sessions";
import { nativeSessionResponse } from "@/lib/native-auth-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const refreshSchema = z.object({ refreshToken: z.string().min(1) }).strict();

export async function POST(request: Request) {
  const parsed = refreshSchema.safeParse(
    await request.json().catch(() => undefined),
  );
  if (!parsed.success) {
    return apiError("invalid_request", "A refresh token is required.", 400);
  }

  const grant = await rotateNativeAppSession(parsed.data.refreshToken);
  if (!grant) {
    return apiError(
      "invalid_refresh_token",
      "This device session has expired. Sign in again.",
      401,
      { "www-authenticate": 'Bearer realm="Currentfold API"' },
    );
  }
  return apiJson(nativeSessionResponse(grant));
}

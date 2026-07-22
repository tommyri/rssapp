import { apiError, apiJson } from "@/lib/api-v1-response";
import {
  AUTH_RATE_LIMITS,
  consumeAuthRateLimit,
  networkRateLimitKeyFromHeaders,
} from "@/lib/auth-rate-limit";
import {
  createNativeAppleChallenge,
  nativeProviderAvailability,
} from "@/lib/native-provider-proof";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  if (!nativeProviderAvailability().apple) {
    return apiError(
      "provider_unavailable",
      "Sign in with Apple is not configured on this Currentfold server.",
      404,
    );
  }

  const networkKey = networkRateLimitKeyFromHeaders(request.headers);
  if (networkKey) {
    const limit = await consumeAuthRateLimit(
      AUTH_RATE_LIMITS.providerChallengeNetwork,
      networkKey,
    );
    if (limit.limited) {
      return apiError(
        "rate_limited",
        `Too many authentication requests. Try again in ${limit.retryAfterSeconds} seconds.`,
        429,
        { "retry-after": String(limit.retryAfterSeconds) },
      );
    }
  }

  const challenge = await createNativeAppleChallenge();
  return apiJson({ data: { challenge } });
}

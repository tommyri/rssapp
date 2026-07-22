import { createHash, randomBytes } from "node:crypto";
import { and, eq, gt, isNull, lt } from "drizzle-orm";
import { OAuth2Client } from "google-auth-library";
import { createRemoteJWKSet, jwtVerify } from "jose";
import { db } from "@/db";
import { oauthIntents } from "@/db/schema";
import type { VerifiedNativeProviderIdentity } from "@/lib/native-provider-accounts";

const APPLE_ISSUER = "https://appleid.apple.com";
const APPLE_KEYS = createRemoteJWKSet(
  new URL("https://appleid.apple.com/auth/keys"),
);
const GOOGLE_CLIENT = new OAuth2Client();
const CHALLENGE_TTL_MS = 10 * 60 * 1000;
const CHALLENGE_PREFIX = "currentfold_challenge_";

export type NativeAuthProvider = "apple" | "google";

export function nativeProviderAvailability(): Record<
  NativeAuthProvider,
  boolean
> {
  return {
    apple: Boolean(process.env.APPLE_NATIVE_CLIENT_ID),
    google: Boolean(process.env.AUTH_GOOGLE_ID),
  };
}

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function verifiedClaim(value: unknown): boolean {
  return value === true || value === "true";
}

export async function createNativeAppleChallenge(): Promise<string> {
  if (!nativeProviderAvailability().apple) {
    throw new Error("Apple native authentication is not configured.");
  }
  const challenge = `${CHALLENGE_PREFIX}${randomBytes(32).toString("base64url")}`;
  await db
    .delete(oauthIntents)
    .where(
      and(
        eq(oauthIntents.provider, "apple"),
        lt(oauthIntents.expiresAt, new Date()),
      ),
    );
  await db.insert(oauthIntents).values({
    provider: "apple",
    kind: "signup",
    tokenHash: hash(challenge),
    expiresAt: new Date(Date.now() + CHALLENGE_TTL_MS),
  });
  return challenge;
}

async function consumeNativeAppleChallenge(
  challenge: string,
): Promise<boolean> {
  if (!challenge.startsWith(CHALLENGE_PREFIX) || challenge.length > 128) {
    return false;
  }
  const [intent] = await db
    .update(oauthIntents)
    .set({ usedAt: new Date() })
    .where(
      and(
        eq(oauthIntents.provider, "apple"),
        eq(oauthIntents.kind, "signup"),
        eq(oauthIntents.tokenHash, hash(challenge)),
        isNull(oauthIntents.usedAt),
        gt(oauthIntents.expiresAt, new Date()),
      ),
    )
    .returning({ id: oauthIntents.id });
  return Boolean(intent);
}

export async function verifyNativeAppleProof({
  identityToken,
  challenge,
  displayName,
}: {
  identityToken: string;
  challenge: string;
  displayName?: string;
}): Promise<VerifiedNativeProviderIdentity | null> {
  const clientId = process.env.APPLE_NATIVE_CLIENT_ID;
  if (!clientId || !(await consumeNativeAppleChallenge(challenge))) return null;

  try {
    const { payload } = await jwtVerify(identityToken, APPLE_KEYS, {
      issuer: APPLE_ISSUER,
      audience: clientId,
      algorithms: ["RS256"],
    });
    if (typeof payload.sub !== "string" || payload.nonce !== hash(challenge)) {
      return null;
    }
    return {
      provider: "apple",
      subject: payload.sub,
      email: typeof payload.email === "string" ? payload.email : null,
      emailVerified: verifiedClaim(payload.email_verified),
      displayName: displayName ?? null,
    };
  } catch (error) {
    console.warn("[native-auth] rejected Apple identity token:", error);
    return null;
  }
}

export async function verifyNativeGoogleProof(
  identityToken: string,
): Promise<VerifiedNativeProviderIdentity | null> {
  const audience = process.env.AUTH_GOOGLE_ID;
  if (!audience) return null;

  try {
    const ticket = await GOOGLE_CLIENT.verifyIdToken({
      idToken: identityToken,
      audience,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub) return null;
    return {
      provider: "google",
      subject: payload.sub,
      email: payload.email ?? null,
      emailVerified: payload.email_verified === true,
      displayName: payload.name ?? null,
    };
  } catch (error) {
    console.warn("[native-auth] rejected Google identity token:", error);
    return null;
  }
}

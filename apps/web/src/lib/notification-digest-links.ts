import { createHmac, timingSafeEqual } from "node:crypto";
import { appOrigin } from "@/lib/transactional-email";

type DigestLinkPayload =
  | {
      kind: "open";
      userId: number;
      notificationId: number;
      expiresAt: number;
    }
  | { kind: "unsubscribe"; userId: number; expiresAt: number };

const OPEN_LINK_LIFETIME_MS = 90 * 24 * 60 * 60_000;
const UNSUBSCRIBE_LINK_LIFETIME_MS = 365 * 24 * 60 * 60_000;

function signingSecret(): string {
  const secret = process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "dev-insecure-secret-change-me";
  }
  throw new Error("AUTH_SECRET is required to sign email digest links.");
}

function signature(encodedPayload: string): Buffer {
  return createHmac("sha256", signingSecret())
    .update(`notification-digest:${encodedPayload}`)
    .digest();
}

function sign(payload: DigestLinkPayload): string {
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded).toString("base64url")}`;
}

function verify(token: string, now: Date): DigestLinkPayload | null {
  const [encoded, encodedSignature, extra] = token.split(".");
  if (!encoded || !encodedSignature || extra) return null;

  let supplied: Buffer;
  try {
    supplied = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  const expected = signature(encoded);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as Partial<DigestLinkPayload>;
    if (
      (payload.kind !== "open" && payload.kind !== "unsubscribe") ||
      !Number.isSafeInteger(payload.userId) ||
      Number(payload.userId) < 1 ||
      !Number.isSafeInteger(payload.expiresAt) ||
      Number(payload.expiresAt) <= now.getTime()
    ) {
      return null;
    }
    if (
      payload.kind === "open" &&
      (!Number.isSafeInteger(payload.notificationId) ||
        Number(payload.notificationId) < 1)
    ) {
      return null;
    }
    return payload as DigestLinkPayload;
  } catch {
    return null;
  }
}

export function createDigestOpenToken(
  userId: number,
  notificationId: number,
  now = new Date(),
): string {
  return sign({
    kind: "open",
    userId,
    notificationId,
    expiresAt: now.getTime() + OPEN_LINK_LIFETIME_MS,
  });
}

export function verifyDigestOpenToken(
  token: string,
  now = new Date(),
): { userId: number; notificationId: number } | null {
  const payload = verify(token, now);
  return payload?.kind === "open"
    ? { userId: payload.userId, notificationId: payload.notificationId }
    : null;
}

export function createDigestUnsubscribeToken(
  userId: number,
  now = new Date(),
): string {
  return sign({
    kind: "unsubscribe",
    userId,
    expiresAt: now.getTime() + UNSUBSCRIBE_LINK_LIFETIME_MS,
  });
}

export function verifyDigestUnsubscribeToken(
  token: string,
  now = new Date(),
): { userId: number } | null {
  const payload = verify(token, now);
  return payload?.kind === "unsubscribe" ? { userId: payload.userId } : null;
}

export function digestOpenUrl(token: string): string {
  const url = new URL("/email-digests/open", `${appOrigin()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function digestUnsubscribeUrl(token: string): string {
  const url = new URL("/email-digests/unsubscribe", `${appOrigin()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

export function digestOneClickUnsubscribeUrl(token: string): string {
  const url = new URL("/api/email-digests/unsubscribe", `${appOrigin()}/`);
  url.searchParams.set("token", token);
  return url.toString();
}

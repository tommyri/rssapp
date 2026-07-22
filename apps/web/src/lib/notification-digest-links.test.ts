import { beforeEach, describe, expect, it } from "vitest";
import {
  createDigestOpenToken,
  createDigestUnsubscribeToken,
  verifyDigestOpenToken,
  verifyDigestUnsubscribeToken,
} from "./notification-digest-links";

const now = new Date("2026-07-19T10:00:00.000Z");

describe("notification digest links", () => {
  beforeEach(() => {
    process.env.AUTH_SECRET = "test-secret-with-enough-entropy";
  });

  it("round-trips an article-open entitlement", () => {
    const token = createDigestOpenToken(4, 91, now);
    expect(verifyDigestOpenToken(token, now)).toEqual({
      userId: 4,
      notificationId: 91,
    });
  });

  it("rejects tampering and expired tokens", () => {
    const token = createDigestOpenToken(4, 91, now);
    expect(verifyDigestOpenToken(`${token}x`, now)).toBeNull();
    expect(
      verifyDigestOpenToken(token, new Date("2027-07-19T10:00:00.000Z")),
    ).toBeNull();
  });

  it("keeps unsubscribe tokens purpose-specific", () => {
    const token = createDigestUnsubscribeToken(4, now);
    expect(verifyDigestUnsubscribeToken(token, now)).toEqual({ userId: 4 });
    expect(verifyDigestOpenToken(token, now)).toBeNull();
  });
});

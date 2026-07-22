import { describe, expect, it } from "vitest";
import { authSessionExpiresAt, isAuthSessionId } from "./auth-sessions";

describe("auth sessions", () => {
  it("accepts only the opaque base64url handles used for signed-in sessions", () => {
    expect(isAuthSessionId("a".repeat(43))).toBe(true);
    expect(isAuthSessionId("a".repeat(42))).toBe(false);
    expect(isAuthSessionId("not a session id")).toBe(false);
  });

  it("expires a server session after the JWT lifetime", () => {
    const now = new Date("2026-07-17T12:00:00.000Z");
    expect(authSessionExpiresAt(now)).toEqual(
      new Date("2026-08-16T12:00:00.000Z"),
    );
  });
});

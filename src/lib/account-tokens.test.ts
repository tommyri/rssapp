import { describe, expect, it } from "vitest";
import {
  ACCOUNT_TOKEN_TTLS,
  createAccountTokenSecret,
  hashAccountToken,
  isAccountTokenSecret,
  normalizeAccountEmail,
} from "./account-tokens";

describe("account token secrets", () => {
  it("creates an opaque, URL-safe secret accepted by the validator", () => {
    const secret = createAccountTokenSecret();
    expect(secret).toHaveLength(43);
    expect(isAccountTokenSecret(secret)).toBe(true);
    expect(isAccountTokenSecret(`${secret}x`)).toBe(false);
    expect(isAccountTokenSecret(secret.replace(/.$/, "+"))).toBe(false);
  });

  it("stores a stable hash rather than the raw token", () => {
    const secret = createAccountTokenSecret();
    expect(hashAccountToken(secret)).toMatch(/^[a-f0-9]{64}$/);
    expect(hashAccountToken(secret)).toBe(hashAccountToken(secret));
    expect(hashAccountToken(secret)).not.toBe(secret);
  });

  it("normalizes account email and keeps short-lived links bounded", () => {
    expect(normalizeAccountEmail("  TOMMY@Example.COM ")).toBe(
      "tommy@example.com",
    );
    expect(ACCOUNT_TOKEN_TTLS.password_reset).toBe(60 * 60 * 1000);
    expect(ACCOUNT_TOKEN_TTLS.email_change).toBe(60 * 60 * 1000);
    expect(ACCOUNT_TOKEN_TTLS.email_verification).toBe(24 * 60 * 60 * 1000);
  });
});

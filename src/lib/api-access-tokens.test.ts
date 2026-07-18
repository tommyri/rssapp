import { describe, expect, it } from "vitest";
import {
  apiAccessTokenDisplayPrefix,
  createApiAccessTokenSecret,
  hashApiAccessToken,
  isApiAccessTokenSecret,
  normalizeApiAccessTokenName,
} from "@/lib/api-access-tokens";

describe("API access token helpers", () => {
  it("creates a well-formed, opaque app credential", () => {
    const secret = createApiAccessTokenSecret();

    expect(isApiAccessTokenSecret(secret)).toBe(true);
    expect(apiAccessTokenDisplayPrefix(secret)).toMatch(/^rssapp_api_.{8}…$/);
    expect(hashApiAccessToken(secret)).not.toContain(secret);
  });

  it("rejects malformed credentials and unsafe display names", () => {
    expect(isApiAccessTokenSecret("rssapp_api_short")).toBe(false);
    expect(isApiAccessTokenSecret("password")).toBe(false);
    expect(normalizeApiAccessTokenName("  NetNewsWire   on  Mac  ")).toBe(
      "NetNewsWire on Mac",
    );
    expect(normalizeApiAccessTokenName("   ")).toBeNull();
    expect(normalizeApiAccessTokenName("x".repeat(81))).toBeNull();
  });
});

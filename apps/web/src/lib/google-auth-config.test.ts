import { describe, expect, it } from "vitest";
import {
  googleAccountSettingsNotice,
  googleAuthNotice,
  googleOAuthCredentials,
  isGoogleAuthEnabled,
} from "./google-auth-config";

describe("Google OAuth configuration", () => {
  it("enables Google only when both credentials are configured", () => {
    expect(googleOAuthCredentials({})).toBeNull();
    expect(
      googleOAuthCredentials({ AUTH_GOOGLE_ID: "id", AUTH_GOOGLE_SECRET: "" }),
    ).toBeNull();
    expect(
      googleOAuthCredentials({
        AUTH_GOOGLE_ID: " client-id ",
        AUTH_GOOGLE_SECRET: " client-secret ",
      }),
    ).toEqual({ clientId: "client-id", clientSecret: "client-secret" });
    expect(
      isGoogleAuthEnabled({
        AUTH_GOOGLE_ID: "id",
        AUTH_GOOGLE_SECRET: "secret",
      }),
    ).toBe(true);
  });

  it("maps only known callback notices to user-facing language", () => {
    expect(googleAuthNotice("link-required")).toContain("Settings");
    expect(googleAccountSettingsNotice("connected")).toContain("connected");
    expect(googleAuthNotice("unknown")).toBeUndefined();
  });
});

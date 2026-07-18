import { describe, expect, it } from "vitest";
import { gReaderCredentialFromAuthorization } from "@/lib/greader-auth";

describe("Google Reader authorization headers", () => {
  it("accepts the legacy and direct integration header forms", () => {
    expect(
      gReaderCredentialFromAuthorization("GoogleLogin auth=rssapp_api_secret"),
    ).toBe("rssapp_api_secret");
    expect(gReaderCredentialFromAuthorization("Bearer rssapp_api_secret")).toBe(
      "rssapp_api_secret",
    );
  });

  it("rejects malformed values", () => {
    expect(gReaderCredentialFromAuthorization(null)).toBeNull();
    expect(gReaderCredentialFromAuthorization("GoogleLogin auth=")).toBeNull();
    expect(gReaderCredentialFromAuthorization("Basic abc")).toBeNull();
  });
});

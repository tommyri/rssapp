import { describe, expect, it } from "vitest";
import { getBuildIdentity } from "@/lib/build-identity";
import packageJson from "../../package.json";

describe("getBuildIdentity", () => {
  it("uses package metadata and a local revision fallback in development", () => {
    expect(getBuildIdentity({})).toEqual({
      version: packageJson.version,
      revision: null,
      shortRevision: null,
    });
  });

  it("returns the baked calendar version and normalized source revision", () => {
    expect(
      getBuildIdentity({
        RSSAPP_VERSION: "2026.7.3",
        RSSAPP_REVISION: "4CC354B7DD824F72BFA3DB88D8350A8A151F0505",
      }),
    ).toEqual({
      version: "2026.7.3",
      revision: "4cc354b7dd824f72bfa3db88d8350a8a151f0505",
      shortRevision: "4cc354b7dd82",
    });
  });

  it("does not expose malformed deployment metadata", () => {
    expect(
      getBuildIdentity({
        RSSAPP_VERSION: "latest<script>",
        RSSAPP_REVISION: "not-a-commit",
      }),
    ).toEqual({
      version: packageJson.version,
      revision: null,
      shortRevision: null,
    });
  });
});

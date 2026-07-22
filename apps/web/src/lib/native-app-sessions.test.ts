import { describe, expect, it } from "vitest";
import {
  isNativeAccessToken,
  isNativeRefreshToken,
  normalizeNativeDeviceName,
} from "@/lib/native-app-sessions";

describe("native app session credentials", () => {
  it("recognizes only complete access and refresh token formats", () => {
    expect(isNativeAccessToken(`currentfold_access_${"a".repeat(43)}`)).toBe(
      true,
    );
    expect(isNativeRefreshToken(`currentfold_refresh_${"Z".repeat(43)}`)).toBe(
      true,
    );
    expect(isNativeAccessToken("currentfold_access_short")).toBe(false);
    expect(isNativeRefreshToken(`currentfold_access_${"a".repeat(43)}`)).toBe(
      false,
    );
  });

  it("normalizes bounded, human-readable device labels", () => {
    expect(normalizeNativeDeviceName("  Tommy's   iPhone  ")).toBe(
      "Tommy's iPhone",
    );
    expect(normalizeNativeDeviceName("   ")).toBe("Currentfold for iOS");
    expect(normalizeNativeDeviceName("x".repeat(120))).toHaveLength(100);
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  authenticate: vi.fn(),
  authenticateNative: vi.fn(),
}));

vi.mock("@/lib/api-access-tokens", () => ({
  authenticateApiAccessToken: mocks.authenticate,
}));

vi.mock("@/lib/native-app-sessions", () => ({
  authenticateNativeAccessToken: mocks.authenticateNative,
  isNativeAccessToken: (value: string) =>
    value.startsWith("currentfold_access_"),
}));

import {
  authenticateFirstPartyApiRequest,
  bearerCredential,
} from "@/lib/api-v1-auth";

describe("first-party API authentication", () => {
  beforeEach(() => vi.clearAllMocks());

  it("accepts only a bearer credential", async () => {
    mocks.authenticate.mockResolvedValue({ id: 7 });
    const request = new Request("https://currentfold.test/api/v1/me", {
      headers: { Authorization: "Bearer rssapp_api_example" },
    });

    expect(bearerCredential("GoogleLogin auth=legacy")).toBeNull();
    expect(await authenticateFirstPartyApiRequest(request)).toEqual({ id: 7 });
    expect(mocks.authenticate).toHaveBeenCalledWith("rssapp_api_example");
  });

  it("routes a native access credential through device-session auth", async () => {
    mocks.authenticateNative.mockResolvedValue({ id: 8 });
    const credential = `currentfold_access_${"a".repeat(43)}`;
    const request = new Request("https://currentfold.test/api/v1/me", {
      headers: { Authorization: `Bearer ${credential}` },
    });

    expect(await authenticateFirstPartyApiRequest(request)).toEqual({ id: 8 });
    expect(mocks.authenticateNative).toHaveBeenCalledWith(credential);
    expect(mocks.authenticate).not.toHaveBeenCalled();
  });
});

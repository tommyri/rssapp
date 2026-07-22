import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("@/lib/api-access-tokens", () => ({
  authenticateApiAccessToken: mocks.authenticate,
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
});

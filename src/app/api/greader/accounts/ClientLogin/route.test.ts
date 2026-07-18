import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ authenticate: vi.fn() }));

vi.mock("@/lib/api-access-tokens", () => ({
  authenticateApiAccessToken: mocks.authenticate,
}));

import { POST } from "./route";

describe("Google Reader ClientLogin", () => {
  beforeEach(() => vi.resetAllMocks());

  it("exchanges an app password only when it belongs to the entered email", async () => {
    mocks.authenticate.mockResolvedValue({
      id: 3,
      email: "reader@example.com",
      displayName: null,
    });
    const formData = new FormData();
    formData.set("Email", "Reader@Example.com");
    formData.set("Passwd", "rssapp_api_secret");

    const response = await POST(
      new Request("https://rssapp.test/api/greader/accounts/ClientLogin", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.text()).toContain("Auth=rssapp_api_secret");
  });

  it("never falls back to the account password", async () => {
    mocks.authenticate.mockResolvedValue(null);
    const formData = new FormData();
    formData.set("Email", "reader@example.com");
    formData.set("Passwd", "an-account-password");

    const response = await POST(
      new Request("https://rssapp.test/api/greader/accounts/ClientLogin", {
        method: "POST",
        body: formData,
      }),
    );

    expect(response.status).toBe(403);
    expect(await response.text()).toBe("Error=BadAuthentication\n");
  });
});

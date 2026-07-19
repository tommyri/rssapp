import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDigestOpenToken } from "@/lib/notification-digest-links";

const mocks = vi.hoisted(() => ({
  getOptionalUserId: vi.fn(),
  markNotificationRead: vi.fn(),
}));

vi.mock("@/lib/current-user", () => ({
  getOptionalUserId: mocks.getOptionalUserId,
}));
vi.mock("@/lib/notifications", () => ({
  markNotificationRead: mocks.markNotificationRead,
}));

import { GET } from "./route";

describe("GET /email-digests/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "test-secret-with-enough-entropy";
  });

  it("preserves the signed deep link through login", async () => {
    mocks.getOptionalUserId.mockResolvedValue(null);
    const token = createDigestOpenToken(4, 91);
    const response = await GET(
      new Request(`https://reader.test/email-digests/open?token=${token}`),
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.pathname).toBe("/login");
    expect(location.searchParams.get("returnTo")).toBe(
      `/email-digests/open?token=${token}`,
    );
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it("marks the entitled account's notification and opens its article", async () => {
    mocks.getOptionalUserId.mockResolvedValue(4);
    mocks.markNotificationRead.mockResolvedValue(true);
    const token = createDigestOpenToken(4, 91);
    const response = await GET(
      new Request(`https://reader.test/email-digests/open?token=${token}`),
    );

    expect(mocks.markNotificationRead).toHaveBeenCalledWith(4, 91);
    expect(response.headers.get("location")).toBe(
      "https://reader.test/?view=notifications&notification=91",
    );
  });

  it("does not apply an entitlement to a different signed-in account", async () => {
    mocks.getOptionalUserId.mockResolvedValue(7);
    const token = createDigestOpenToken(4, 91);
    const response = await GET(
      new Request(`https://reader.test/email-digests/open?token=${token}`),
    );

    expect(response.headers.get("location")).toBe(
      "https://reader.test/?view=notifications",
    );
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });
});

import { beforeEach, describe, expect, it, vi } from "vitest";
import { createDigestUnsubscribeToken } from "@/lib/notification-digest-links";

const mocks = vi.hoisted(() => ({ disableNotificationDigests: vi.fn() }));

vi.mock("@/lib/notification-digests", () => ({
  disableNotificationDigests: mocks.disableNotificationDigests,
}));

import { POST } from "./route";

describe("POST /api/email-digests/unsubscribe", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.AUTH_SECRET = "test-secret-with-enough-entropy";
  });

  it("disables the entitled account without an interactive session", async () => {
    const token = createDigestUnsubscribeToken(4);
    const response = await POST(
      new Request(
        `https://reader.test/api/email-digests/unsubscribe?token=${token}`,
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(200);
    expect(mocks.disableNotificationDigests).toHaveBeenCalledWith(4);
  });

  it("rejects a tampered token", async () => {
    const response = await POST(
      new Request(
        "https://reader.test/api/email-digests/unsubscribe?token=bad",
        { method: "POST" },
      ),
    );

    expect(response.status).toBe(400);
    expect(mocks.disableNotificationDigests).not.toHaveBeenCalled();
  });
});

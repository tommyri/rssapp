import { beforeEach, describe, expect, it, vi } from "vitest";

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

import { POST } from "./route";

const context = (notificationId: string) => ({
  params: Promise.resolve({ notificationId }),
});

describe("POST /api/notifications/[notificationId]/open", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("requires a signed-in reader", async () => {
    mocks.getOptionalUserId.mockResolvedValue(null);

    const response = await POST(
      new Request("https://reader.test"),
      context("91"),
    );

    expect(response.status).toBe(401);
    expect(mocks.markNotificationRead).not.toHaveBeenCalled();
  });

  it("marks only the authenticated reader's target notification", async () => {
    mocks.getOptionalUserId.mockResolvedValue(4);
    mocks.markNotificationRead.mockResolvedValue(true);

    const response = await POST(
      new Request("https://reader.test"),
      context("91"),
    );

    expect(response.status).toBe(204);
    expect(mocks.markNotificationRead).toHaveBeenCalledWith(4, 91);
  });
});

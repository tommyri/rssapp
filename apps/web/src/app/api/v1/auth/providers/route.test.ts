import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ availability: vi.fn() }));

vi.mock("@/lib/native-provider-proof", () => ({
  nativeProviderAvailability: mocks.availability,
}));

import { GET } from "./route";

describe("native provider discovery route", () => {
  beforeEach(() => vi.clearAllMocks());

  it("only advertises providers configured by the server", async () => {
    mocks.availability.mockReturnValue({ apple: true, google: false });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { apple: true, google: false },
    });
  });
});

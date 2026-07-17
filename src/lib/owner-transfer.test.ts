import { describe, expect, it } from "vitest";
import { canReceiveOwnership } from "./owner-transfer";

const verifiedAt = new Date("2026-07-17T10:00:00.000Z");

describe("canReceiveOwnership", () => {
  it("allows an active, verified member to take ownership", () => {
    expect(
      canReceiveOwnership({
        role: "member",
        status: "active",
        emailVerifiedAt: verifiedAt,
      }),
    ).toBe(true);
  });

  it.each([
    { role: "member", status: "active", emailVerifiedAt: null },
    { role: "member", status: "suspended", emailVerifiedAt: verifiedAt },
    { role: "owner", status: "active", emailVerifiedAt: verifiedAt },
  ] as const)("rejects an ineligible ownership recipient", (candidate) => {
    expect(canReceiveOwnership(candidate)).toBe(false);
  });
});

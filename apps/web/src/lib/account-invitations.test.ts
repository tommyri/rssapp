import { describe, expect, it } from "vitest";
import {
  ACCOUNT_INVITE_TTL_MS,
  isRegistrationMode,
  registrationAdmission,
  registrationModeDescription,
} from "./account-invitations";

describe("registration policy", () => {
  it("keeps public signup as the explicit default option", () => {
    expect(isRegistrationMode("open")).toBe(true);
    expect(isRegistrationMode("invite_only")).toBe(true);
    expect(isRegistrationMode("closed")).toBe(true);
    expect(isRegistrationMode("members")).toBe(false);
    expect(registrationModeDescription("open")).toContain("Anyone");
  });

  it("makes invitations short-lived without being burdensome to recipients", () => {
    expect(ACCOUNT_INVITE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it("enforces the mode only for a brand-new account", () => {
    expect(registrationAdmission("open", false)).toBe("allowed");
    expect(registrationAdmission("invite_only", true)).toBe("allowed");
    expect(registrationAdmission("invite_only", false)).toBe("invite_required");
    expect(registrationAdmission("closed", true)).toBe("closed");
  });
});

import { describe, expect, it } from "vitest";
import { registrationRole } from "./account-lifecycle";

describe("registrationRole", () => {
  it("makes the first account in an empty deployment its owner", () => {
    expect(registrationRole(0)).toBe("owner");
  });

  it("never grants owner access to a signup when accounts already exist", () => {
    expect(registrationRole(1)).toBe("member");
    expect(registrationRole(2)).toBe("member");
  });
});

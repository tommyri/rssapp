import { describe, expect, it } from "vitest";
import { hashPassword as scriptHashPassword } from "../../scripts/reset-password.mjs";
import { hashPassword, verifyPassword } from "./password";

describe("password hashing", () => {
  it("round-trips: a hashed password verifies", () => {
    const stored = hashPassword("correct horse battery staple");
    expect(verifyPassword("correct horse battery staple", stored)).toBe(true);
    expect(verifyPassword("wrong password", stored)).toBe(false);
  });

  it("salts: hashing the same password twice differs", () => {
    expect(hashPassword("hunter2")).not.toBe(hashPassword("hunter2"));
  });

  it("rejects malformed stored values", () => {
    expect(verifyPassword("x", "not-a-hash")).toBe(false);
    expect(verifyPassword("x", "")).toBe(false);
  });
});

describe("reset-password script compatibility", () => {
  // The admin script (scripts/reset-password.mjs) re-implements hashPassword in
  // plain JS so it can run inside the standalone production image. This pins
  // the two implementations together: if either changes format, this fails.
  it("script-hashed passwords verify with the app's verifyPassword", () => {
    const stored = scriptHashPassword("reset-via-script");
    expect(verifyPassword("reset-via-script", stored)).toBe(true);
    expect(verifyPassword("some other password", stored)).toBe(false);
  });
});

import { describe, expect, it } from "vitest";
import { safeReturnTo } from "./safe-return-to";

describe("safeReturnTo", () => {
  it("keeps a local digest deep link", () => {
    expect(safeReturnTo("/email-digests/open?token=abc")).toBe(
      "/email-digests/open?token=abc",
    );
  });

  it("rejects absolute and scheme-relative redirects", () => {
    expect(safeReturnTo("https://attacker.example/path")).toBe("/");
    expect(safeReturnTo("//attacker.example/path")).toBe("/");
  });
});

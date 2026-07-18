import { describe, expect, it } from "vitest";
import { articleUrlCandidate, isPublicInternetAddress } from "./fetch";

describe("article extraction URL policy", () => {
  it("accepts public HTTP(S) targets", () => {
    expect(articleUrlCandidate("https://example.com/article")?.hostname).toBe(
      "example.com",
    );
    expect(isPublicInternetAddress("1.1.1.1")).toBe(true);
  });

  it("rejects unsupported, credentialed, and non-standard-port URLs", () => {
    expect(articleUrlCandidate("file:///etc/passwd")).toBeNull();
    expect(
      articleUrlCandidate("https://user:pass@example.com/article"),
    ).toBeNull();
    expect(articleUrlCandidate("https://example.com:8080/article")).toBeNull();
  });

  it("rejects loopback, private, link-local, and documentation targets", () => {
    for (const address of [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.1.1",
      "192.168.1.1",
      "::1",
      "fd00::1",
      "2001:db8::1",
    ]) {
      expect(isPublicInternetAddress(address)).toBe(false);
    }
    expect(articleUrlCandidate("http://localhost:3000")).toBeNull();
    expect(articleUrlCandidate("http://127.0.0.1/admin")).toBeNull();
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import {
  fetchFeedUrl,
  isPublicInternetAddress,
  safeFetchCandidate,
} from "./fetch";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("outbound fetch URL policy", () => {
  it("accepts public HTTP(S) targets", () => {
    expect(safeFetchCandidate("https://example.com/article")?.hostname).toBe(
      "example.com",
    );
    expect(isPublicInternetAddress("1.1.1.1")).toBe(true);
  });

  it("accepts a public address literal, unusual as that is for a feed", () => {
    expect(safeFetchCandidate("https://93.184.216.34/feed.xml")?.hostname).toBe(
      "93.184.216.34",
    );
  });

  it("rejects unsupported, credentialed, and non-standard-port URLs", () => {
    expect(safeFetchCandidate("file:///etc/passwd")).toBeNull();
    expect(
      safeFetchCandidate("https://user:pass@example.com/article"),
    ).toBeNull();
    expect(safeFetchCandidate("https://example.com:8080/article")).toBeNull();
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
    expect(safeFetchCandidate("http://localhost:3000")).toBeNull();
    expect(safeFetchCandidate("http://127.0.0.1/admin")).toBeNull();
  });

  it("rejects the cloud metadata address that makes blind SSRF valuable", () => {
    expect(
      safeFetchCandidate(
        "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
      ),
    ).toBeNull();
  });

  it("applies the same policy to a feed as to an article, with no opt-out", () => {
    // A feed URL is a domain name, so nothing legitimate needs the deployment's
    // own network. There is deliberately no setting that would relax this.
    for (const target of [
      "http://192.168.1.10:3000/feed.xml",
      "http://localhost:8123/feed",
      "http://10.0.0.5/rss",
    ]) {
      expect(safeFetchCandidate(target)).toBeNull();
    }
  });
});

describe("guarded feed fetching", () => {
  it("refuses a private literal target without making a request", async () => {
    const outbound = vi.fn();
    vi.stubGlobal("fetch", outbound);

    await expect(fetchFeedUrl("http://127.0.0.1:6379/")).resolves.toEqual({
      status: "error",
      error: expect.stringContaining("not a safe HTTP(S) URL"),
    });
    expect(outbound).not.toHaveBeenCalled();
  });

  it("refuses a public hostname that resolves onto the private network", async () => {
    const outbound = vi.fn();
    vi.stubGlobal("fetch", outbound);
    mocks.lookup.mockResolvedValue([{ address: "10.0.0.5", family: 4 }]);

    await expect(
      fetchFeedUrl("https://feeds.example.com/rss"),
    ).resolves.toEqual({
      status: "error",
      error: expect.stringContaining("resolves to a private network address"),
    });
    expect(outbound).not.toHaveBeenCalled();
  });

  it("fetches a feed whose hostname resolves publicly", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<rss/>", { status: 200 })),
    );

    await expect(
      fetchFeedUrl("https://feeds.example.com/rss"),
    ).resolves.toMatchObject({ status: "ok", body: "<rss/>" });
  });
});

import { afterEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ lookup: vi.fn() }));

vi.mock("node:dns/promises", () => ({ lookup: mocks.lookup }));

import {
  fetchFeedUrl,
  isPublicInternetAddress,
  publicOnlyLookup,
  safeFetchCandidate,
} from "./fetch";

/** Drive the connect-time lookup the way undici's socket factory does. */
function resolveThroughGuard(
  hostname: string,
  options: { all?: boolean } = { all: true },
) {
  return new Promise<{ error: Error | null; addresses: unknown }>((resolve) => {
    publicOnlyLookup(hostname, options, (error, addresses) => {
      resolve({ error, addresses });
    });
  });
}

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

describe("connect-time address enforcement", () => {
  it("passes through the addresses of a genuinely public name", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);

    const { error, addresses } = await resolveThroughGuard("feeds.example.com");

    expect(error).toBeNull();
    expect(addresses).toEqual([
      { address: "93.184.216.34", family: 4 },
      { address: "2606:2800:220:1:248:1893:25c8:1946", family: 6 },
    ]);
  });

  it("blocks the connection when the name resolves privately", async () => {
    mocks.lookup.mockResolvedValue([{ address: "169.254.169.254", family: 4 }]);

    const { error, addresses } =
      await resolveThroughGuard("metadata.evil.test");

    expect(error?.message).toContain("private network address");
    expect((error as NodeJS.ErrnoException).code).toBe("ECONNREFUSED");
    expect(addresses).toEqual([]);
  });

  it("blocks a rebinding answer that the pre-flight check would have passed", async () => {
    // The pre-flight resolution sees only public addresses and allows the URL;
    // the connection's own resolution is what this guard has to catch.
    mocks.lookup
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      .mockResolvedValueOnce([{ address: "127.0.0.1", family: 4 }]);

    const preflight = await resolveThroughGuard("rebind.evil.test");
    expect(preflight.error).toBeNull();

    const connect = await resolveThroughGuard("rebind.evil.test");
    expect(connect.error?.message).toContain("private network address");
  });

  it("refuses a name that mixes public and private answers", async () => {
    mocks.lookup.mockResolvedValue([
      { address: "93.184.216.34", family: 4 },
      { address: "10.0.0.5", family: 4 },
    ]);

    const { error } = await resolveThroughGuard("split.evil.test");

    expect(error?.message).toContain("private network address");
  });

  it("answers the single-address form when undici asks for one", async () => {
    mocks.lookup.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);

    await new Promise<void>((resolve) => {
      publicOnlyLookup(
        "feeds.example.com",
        { all: false },
        (error, address, family) => {
          expect(error).toBeNull();
          expect(address).toBe("93.184.216.34");
          expect(family).toBe(4);
          resolve();
        },
      );
    });
  });

  it("blocks the connection when resolution fails outright", async () => {
    mocks.lookup.mockRejectedValue(new Error("ENOTFOUND"));

    const { error } = await resolveThroughGuard("missing.example.test");

    expect(error?.message).toContain("could not be resolved");
  });

  // Real fetch, no stub: proves the dispatcher is actually wired into the fetch
  // path rather than merely correct in isolation. Nothing leaves the process —
  // the guard rejects during resolution, before any socket is opened.
  it("stops a rebinding answer reaching the network through fetchFeedUrl", async () => {
    mocks.lookup
      // The pre-flight resolution is answered with a public address, so the URL
      // passes every check that happens before the connection.
      .mockResolvedValueOnce([{ address: "93.184.216.34", family: 4 }])
      // Everything after that — the resolution undici connects with — is private.
      .mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);

    const result = await fetchFeedUrl("https://rebind.example.test/rss");

    expect(result.status).toBe("error");
    expect(mocks.lookup.mock.calls.length).toBeGreaterThan(1);
  });
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type FetchHandler = (event: {
  request: Request;
  respondWith: (response: Promise<Response>) => void;
}) => void;

function loadServiceWorker() {
  const listeners = new Map<string, FetchHandler>();
  const cachedResponses = new Map<string, Response>();
  const fetchCalls: Request[] = [];
  let networkAvailable = true;

  runInNewContext(
    readFileSync(resolve(process.cwd(), "public/service-worker.js"), "utf8"),
    {
      URL,
      Request,
      Response,
      Set,
      Map,
      Promise,
      caches: {
        delete: async () => true,
        keys: async () => [],
        match: async (request: Request) => cachedResponses.get(request.url),
        open: async () => ({ put: async () => {} }),
      },
      fetch: async (request: Request) => {
        fetchCalls.push(request);
        if (!networkAvailable) throw new Error("offline");
        return new Response("fresh chunk");
      },
      self: {
        addEventListener: (type: string, handler: FetchHandler) =>
          listeners.set(type, handler),
        clients: { claim: async () => {} },
        location: { origin: "https://reader.test" },
        skipWaiting: () => {},
      },
    },
  );

  return {
    cache(url: string, body: string) {
      cachedResponses.set(url, new Response(body));
    },
    goOffline() {
      networkAvailable = false;
    },
    fetchCalls,
    async respondTo(url: string) {
      let response: Promise<Response> | undefined;
      listeners.get("fetch")?.({
        request: new Request(url),
        respondWith: (next) => {
          response = next;
        },
      });
      if (!response) throw new Error("The service worker did not respond.");
      return response;
    },
  };
}

describe("service worker static chunks", () => {
  it("uses the fresh network chunk while online instead of an old cached module", async () => {
    const worker = loadServiceWorker();
    const url = "https://reader.test/_next/static/chunks/app.js";
    worker.cache(url, "stale chunk");

    const response = await worker.respondTo(url);

    await expect(response.text()).resolves.toBe("fresh chunk");
    expect(worker.fetchCalls).toHaveLength(1);
  });

  it("falls back to the saved chunk only while offline", async () => {
    const worker = loadServiceWorker();
    const url = "https://reader.test/_next/static/chunks/app.js";
    worker.cache(url, "saved chunk");
    worker.goOffline();

    const response = await worker.respondTo(url);

    await expect(response.text()).resolves.toBe("saved chunk");
    expect(worker.fetchCalls).toHaveLength(1);
  });
});

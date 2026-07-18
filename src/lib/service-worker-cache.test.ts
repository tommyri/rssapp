import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type WorkerHandler = (event: Record<string, unknown>) => void;

function loadServiceWorker() {
  const listeners = new Map<string, WorkerHandler>();
  const cachedResponses = new Map<string, Response>();
  const fetchCalls: Request[] = [];
  const openedUrls: string[] = [];
  const shownNotifications: Array<{ title: string; options: unknown }> = [];
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
      fetch: async (input: Request | string, init?: RequestInit) => {
        const request =
          input instanceof Request
            ? input
            : new Request(new URL(input, "https://reader.test"), init);
        fetchCalls.push(request);
        if (!networkAvailable) throw new Error("offline");
        return new Response("fresh chunk");
      },
      self: {
        addEventListener: (type: string, handler: WorkerHandler) =>
          listeners.set(type, handler),
        clients: {
          claim: async () => {},
          matchAll: async () => [],
          openWindow: async (url: string) => {
            openedUrls.push(url);
          },
        },
        location: { origin: "https://reader.test" },
        registration: {
          showNotification: async (title: string, options: unknown) => {
            shownNotifications.push({ title, options });
          },
        },
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
    openedUrls,
    shownNotifications,
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
    async push(payload: unknown) {
      let work: Promise<unknown> | undefined;
      listeners.get("push")?.({
        data: { json: () => payload },
        waitUntil: (next: Promise<unknown>) => {
          work = next;
        },
      });
      if (!work) throw new Error("The service worker did not handle the push.");
      await work;
    },
    async click(data: Record<string, unknown>) {
      let work: Promise<unknown> | undefined;
      listeners.get("notificationclick")?.({
        notification: { close: () => {}, data },
        waitUntil: (next: Promise<unknown>) => {
          work = next;
        },
      });
      if (!work)
        throw new Error("The service worker did not handle the click.");
      await work;
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

describe("service worker browser push", () => {
  it("shows a server-sent rule match and preserves its reader target", async () => {
    const worker = loadServiceWorker();

    await worker.push({
      title: "Engineering",
      body: "Kubernetes operator notes",
      tag: "rssapp-rule-91",
      notificationId: 91,
      url: "/?view=notifications&notification=91",
    });

    expect(worker.shownNotifications).toEqual([
      {
        title: "Engineering",
        options: {
          body: "Kubernetes operator notes",
          data: {
            notificationId: 91,
            url: "/?view=notifications&notification=91",
          },
          icon: "/icon",
          tag: "rssapp-rule-91",
        },
      },
    ]);
  });

  it("marks an opened push alert read before opening its article", async () => {
    const worker = loadServiceWorker();

    await worker.click({
      notificationId: 91,
      url: "/?view=notifications&notification=91",
    });

    expect(
      worker.fetchCalls.map((request) => ({
        method: request.method,
        url: request.url,
      })),
    ).toContainEqual({
      method: "POST",
      url: "https://reader.test/api/notifications/91/open",
    });
    expect(worker.openedUrls).toEqual([
      "https://reader.test/?view=notifications&notification=91",
    ]);
  });
});

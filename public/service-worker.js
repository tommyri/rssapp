const SHELL_CACHE = "rssapp-offline-shell-v2";
const OFFLINE_PAGE = "/offline";

async function cacheOfflineShell() {
  const cache = await caches.open(SHELL_CACHE);
  const response = await fetch(OFFLINE_PAGE, { credentials: "same-origin" });
  if (!response.ok) throw new Error("Could not cache the offline library.");

  await cache.put(OFFLINE_PAGE, response.clone());
  const html = await response.text();
  const assets = [
    ...new Set(
      [
        ...html.matchAll(
          /(?:src|href)="(\/_next\/static\/[^"?]+(?:\?[^"\s]*)?)"/g,
        ),
      ].map((match) => match[1]),
    ),
  ];

  await Promise.all(
    assets.map(async (asset) => {
      const assetResponse = await fetch(asset, { credentials: "same-origin" });
      if (assetResponse.ok) await cache.put(asset, assetResponse);
    }),
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(cacheOfflineShell());
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter(
              (name) =>
                name.startsWith("rssapp-offline-") && name !== SHELL_CACHE,
            )
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(async () => {
        if (url.pathname === OFFLINE_PAGE) {
          return (await caches.match(OFFLINE_PAGE)) ?? Response.error();
        }
        return Response.redirect(
          new URL(OFFLINE_PAGE, self.location.origin),
          302,
        );
      }),
    );
    return;
  }

  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(
      caches.match(request).then(async (cached) => {
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok && response.type === "basic") {
          const cache = await caches.open(SHELL_CACHE);
          cache.put(request, response.clone());
        }
        return response;
      }),
    );
  }
});

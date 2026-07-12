const SHELL_CACHE = "rssapp-offline-shell-v3";
const OFFLINE_PAGE = "/offline";
const OFFLINE_DATABASE = "rssapp-offline-library";
const OFFLINE_DATABASE_VERSION = 2;
const MUTATION_STORE = "mutations";
const BACKGROUND_SYNC_TAG = "rssapp-offline-mutations";

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

function requestResult(request) {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", resolve);
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function openOfflineDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(OFFLINE_DATABASE, OFFLINE_DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains("articles")) {
        request.result.createObjectStore("articles", { keyPath: "key" });
      }
      if (!request.result.objectStoreNames.contains(MUTATION_STORE)) {
        request.result.createObjectStore(MUTATION_STORE, { keyPath: "key" });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

async function readQueuedMutations() {
  const database = await openOfflineDatabase();
  try {
    const transaction = database.transaction(MUTATION_STORE, "readonly");
    const records = await requestResult(
      transaction.objectStore(MUTATION_STORE).getAll(),
    );
    await transactionDone(transaction);
    return records.sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } finally {
    database.close();
  }
}

async function deleteAppliedMutations(applied) {
  if (!applied.length) return;
  const acknowledged = new Map(applied.map(({ key, token }) => [key, token]));
  const database = await openOfflineDatabase();
  try {
    const transaction = database.transaction(MUTATION_STORE, "readwrite");
    const store = transaction.objectStore(MUTATION_STORE);
    const current = await requestResult(store.getAll());
    for (const mutation of current) {
      if (acknowledged.get(mutation.key) === mutation.token) {
        store.delete(mutation.key);
      }
    }
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

async function syncQueuedMutations() {
  while (true) {
    const mutations = (await readQueuedMutations()).slice(0, 100);
    if (!mutations.length) return;

    const response = await fetch("/api/offline/mutations", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ mutations }),
    });
    if (!response.ok) throw new Error("Offline mutation sync failed.");
    const result = await response.json();
    if (!Array.isArray(result.applied) || result.applied.length === 0) return;
    await deleteAppliedMutations(result.applied);
    if (mutations.length < 100) return;
  }
}

self.addEventListener("sync", (event) => {
  if (event.tag === BACKGROUND_SYNC_TAG) {
    event.waitUntil(syncQueuedMutations());
  }
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

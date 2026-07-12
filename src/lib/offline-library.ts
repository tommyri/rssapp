import type { ReaderItem } from "@/lib/reader";

const DATABASE_NAME = "rssapp-offline-library";
const STORE_NAME = "articles";
const MUTATION_STORE_NAME = "mutations";
const DATABASE_VERSION = 2;
const OFFLINE_OWNER_KEY = "rssapp:offline-owner";
const OFFLINE_AUTO_DOWNLOAD_KEY = "rssapp:offline-read-later-auto-download";

export type OfflineArticleSource = "manual" | "automatic";
export type OfflineMutableField = "read" | "starred" | "readLater";
export const OFFLINE_MUTATIONS_QUEUED_EVENT = "rssapp:offline-mutations-queued";

export interface OfflineArticle {
  key: string;
  userId: number;
  kind: ReaderItem["kind"];
  itemId: number;
  title: string | null;
  url: string | null;
  author: string | null;
  feedTitle: string | null;
  publishedAt: string | null;
  savedAt: string;
  contentHtml: string;
  /** Missing on older records; treated as a manually preserved copy. */
  source?: OfflineArticleSource;
  /** Reader state is optional so earlier offline records remain readable. */
  read?: boolean;
  starred?: boolean;
  readLater?: boolean;
}

export interface OfflineMutation {
  /** Coalesces repeated changes to the same reader field. */
  key: string;
  userId: number;
  kind: ReaderItem["kind"];
  itemId: number;
  field: OfflineMutableField;
  value: boolean;
  /** Identifies this exact value so a newer queued toggle cannot be deleted. */
  token: string;
  queuedAt: string;
}

export interface OfflineDataClearPlan {
  articleKeys: string[];
  mutationKeys: string[];
}

export const OFFLINE_READ_LATER_DOWNLOAD_LIMIT = 50;
export const OFFLINE_READ_LATER_AUTO_DOWNLOAD_LIMITS = [
  0, 25, 50, 100,
] as const;

export type OfflineReadLaterAutoDownloadLimit =
  (typeof OFFLINE_READ_LATER_AUTO_DOWNLOAD_LIMITS)[number];

export function parseOfflineReadLaterAutoDownloadLimit(
  value: string | null,
): OfflineReadLaterAutoDownloadLimit {
  const parsed = Number(value);
  return OFFLINE_READ_LATER_AUTO_DOWNLOAD_LIMITS.includes(
    parsed as OfflineReadLaterAutoDownloadLimit,
  )
    ? (parsed as OfflineReadLaterAutoDownloadLimit)
    : 0;
}

export function offlineArticleFromReaderItem(
  userId: number,
  item: ReaderItem,
  contentHtml: string,
  source: OfflineArticleSource = "manual",
): OfflineArticle {
  return {
    key: `${userId}:${item.kind}:${item.id}`,
    userId,
    kind: item.kind,
    itemId: item.id,
    title: item.title,
    url: item.url,
    author: item.author,
    feedTitle: item.feedTitle,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    savedAt: new Date().toISOString(),
    contentHtml,
    source,
    read: item.read,
    starred: item.starred,
    readLater: item.readLater,
  };
}

function mutationToken(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}:${Math.random()}`;
}

export function offlineMutationFromArticle(
  article: OfflineArticle,
  field: OfflineMutableField,
  value: boolean,
): OfflineMutation {
  if (article.kind === "page" && field !== "read") {
    throw new Error("Saved pages only support read-state sync.");
  }
  return {
    key: `${article.userId}:${article.kind}:${article.itemId}:${field}`,
    userId: article.userId,
    kind: article.kind,
    itemId: article.itemId,
    field,
    value,
    token: mutationToken(),
    queuedAt: new Date().toISOString(),
  };
}

export function offlineDataClearPlan(
  userId: number,
  articles: OfflineArticle[],
  mutations: OfflineMutation[],
): OfflineDataClearPlan {
  return {
    articleKeys: articles
      .filter((article) => article.userId === userId)
      .map((article) => article.key),
    mutationKeys: mutations
      .filter((mutation) => mutation.userId === userId)
      .map((mutation) => mutation.key),
  };
}

/** Approximate on-device library size; excludes browser and service-worker overhead. */
export function offlineLibraryByteEstimate(articles: OfflineArticle[]): number {
  return new TextEncoder().encode(JSON.stringify(articles)).byteLength;
}

/**
 * Creates a deliberately bounded, text-only local copy of Read later. The
 * full article takes precedence when it is already available; items without a
 * readable body are omitted rather than pretending they can be read offline.
 */
export function offlineArticlesFromReaderItems(
  userId: number,
  items: ReaderItem[],
  limit = OFFLINE_READ_LATER_DOWNLOAD_LIMIT,
  source: OfflineArticleSource = "manual",
): OfflineArticle[] {
  return items.slice(0, limit).flatMap((item) => {
    const contentHtml = item.fullContentHtml ?? item.contentHtml;
    return contentHtml
      ? [offlineArticleFromReaderItem(userId, item, contentHtml, source)]
      : [];
  });
}

export interface AutomaticOfflineReconciliationPlan {
  articles: OfflineArticle[];
  staleKeys: string[];
}

/**
 * Replaces only the automatic portion of a user's library. A manual copy wins
 * when it shares a key with an automatic candidate, including older records
 * from before sources were tracked.
 */
export function automaticOfflineReconciliationPlan(
  userId: number,
  existing: OfflineArticle[],
  incoming: OfflineArticle[],
): AutomaticOfflineReconciliationPlan {
  const existingByKey = new Map(
    existing
      .filter((article) => article.userId === userId)
      .map((article) => [article.key, article]),
  );
  const incomingKeys = new Set(incoming.map((article) => article.key));

  return {
    articles: incoming.map((article) => {
      const current = existingByKey.get(article.key);
      return current?.source === "automatic"
        ? { ...article, source: "automatic" }
        : {
            ...article,
            source: "manual",
            read: current?.read ?? article.read,
            starred: current?.starred ?? article.starred,
            readLater: current?.readLater ?? article.readLater,
          };
    }),
    staleKeys: existing
      .filter(
        (article) =>
          article.userId === userId &&
          article.source === "automatic" &&
          !incomingKeys.has(article.key),
      )
      .map((article) => article.key),
  };
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.addEventListener("complete", () => resolve());
    transaction.addEventListener("abort", () => reject(transaction.error));
    transaction.addEventListener("error", () => reject(transaction.error));
  });
}

function openOfflineLibrary(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("Offline storage is not supported here."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.addEventListener("upgradeneeded", () => {
      if (!request.result.objectStoreNames.contains(STORE_NAME)) {
        request.result.createObjectStore(STORE_NAME, { keyPath: "key" });
      }
      if (!request.result.objectStoreNames.contains(MUTATION_STORE_NAME)) {
        request.result.createObjectStore(MUTATION_STORE_NAME, {
          keyPath: "key",
        });
      }
    });
    request.addEventListener("success", () => resolve(request.result));
    request.addEventListener("error", () => reject(request.error));
  });
}

export async function saveOfflineArticle(
  article: OfflineArticle,
): Promise<void> {
  await saveOfflineArticles([article]);
}

export async function saveOfflineArticles(
  articles: OfflineArticle[],
): Promise<void> {
  if (articles.length === 0) return;
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    for (const article of articles) store.put(article);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

/** Atomically applies a local reader-state change and queues its server sync. */
export async function updateOfflineArticleAndQueueMutation(
  article: OfflineArticle,
  field: OfflineMutableField,
  value: boolean,
): Promise<OfflineArticle> {
  // A user interaction promotes an automatic copy to a preserved manual one,
  // so the next automatic set refresh cannot overwrite its local state.
  const updated = {
    ...article,
    source: "manual",
    [field]: value,
  } as OfflineArticle;
  const mutation = offlineMutationFromArticle(updated, field, value);
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(
      [STORE_NAME, MUTATION_STORE_NAME],
      "readwrite",
    );
    transaction.objectStore(STORE_NAME).put(updated);
    transaction.objectStore(MUTATION_STORE_NAME).put(mutation);
    await transactionDone(transaction);
    return updated;
  } finally {
    database.close();
  }
}

export async function listOfflineMutations(
  userId: number,
): Promise<OfflineMutation[]> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(MUTATION_STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(MUTATION_STORE_NAME).getAll(),
    );
    await transactionDone(transaction);
    return (records as OfflineMutation[])
      .filter((mutation) => mutation.userId === userId)
      .sort((a, b) => a.queuedAt.localeCompare(b.queuedAt));
  } finally {
    database.close();
  }
}

/** Removes only the mutation version that was successfully applied. */
export async function removeOfflineMutationIfUnchanged(
  mutation: OfflineMutation,
): Promise<void> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(MUTATION_STORE_NAME, "readwrite");
    const store = transaction.objectStore(MUTATION_STORE_NAME);
    const current = (await requestResult(store.get(mutation.key))) as
      | OfflineMutation
      | undefined;
    if (current?.token === mutation.token) store.delete(mutation.key);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

/** Deletes every local copy and queued mutation belonging to one user. */
export async function clearOfflineDataForUser(userId: number): Promise<number> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(
      [STORE_NAME, MUTATION_STORE_NAME],
      "readwrite",
    );
    const articleStore = transaction.objectStore(STORE_NAME);
    const mutationStore = transaction.objectStore(MUTATION_STORE_NAME);
    const [articles, mutations] = await Promise.all([
      requestResult(articleStore.getAll()) as Promise<OfflineArticle[]>,
      requestResult(mutationStore.getAll()) as Promise<OfflineMutation[]>,
    ]);
    const plan = offlineDataClearPlan(userId, articles, mutations);
    for (const key of plan.articleKeys) articleStore.delete(key);
    for (const key of plan.mutationKeys) mutationStore.delete(key);
    await transactionDone(transaction);
    return plan.articleKeys.length + plan.mutationKeys.length;
  } finally {
    database.close();
  }
}

/**
 * Atomically refreshes an automatic Read later set while retaining manually
 * kept copies. It returns the number of obsolete automatic entries removed.
 */
export async function reconcileAutomaticOfflineArticles(
  userId: number,
  articles: OfflineArticle[],
): Promise<number> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    const store = transaction.objectStore(STORE_NAME);
    const existing = (await requestResult(store.getAll())) as OfflineArticle[];
    const plan = automaticOfflineReconciliationPlan(userId, existing, articles);
    for (const key of plan.staleKeys) store.delete(key);
    for (const article of plan.articles) store.put(article);
    await transactionDone(transaction);
    return plan.staleKeys.length;
  } finally {
    database.close();
  }
}

export async function listOfflineArticles(
  userId: number,
): Promise<OfflineArticle[]> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(STORE_NAME, "readonly");
    const records = await requestResult(
      transaction.objectStore(STORE_NAME).getAll(),
    );
    await transactionDone(transaction);
    return (records as OfflineArticle[])
      .filter((article) => article.userId === userId)
      .sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  } finally {
    database.close();
  }
}

export async function removeOfflineArticle(key: string): Promise<void> {
  const database = await openOfflineLibrary();
  try {
    const transaction = database.transaction(STORE_NAME, "readwrite");
    transaction.objectStore(STORE_NAME).delete(key);
    await transactionDone(transaction);
  } finally {
    database.close();
  }
}

export function setOfflineOwner(userId: number): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(OFFLINE_OWNER_KEY, String(userId));
  }
}

export function getOfflineOwner(): number | null {
  if (typeof localStorage === "undefined") return null;
  const userId = Number(localStorage.getItem(OFFLINE_OWNER_KEY));
  return Number.isInteger(userId) && userId > 0 ? userId : null;
}

export function clearOfflineOwner(userId: number): void {
  if (getOfflineOwner() === userId && typeof localStorage !== "undefined") {
    localStorage.removeItem(OFFLINE_OWNER_KEY);
  }
}

function offlineAutoDownloadKey(userId: number): string {
  return `${OFFLINE_AUTO_DOWNLOAD_KEY}:${userId}`;
}

export function getOfflineReadLaterAutoDownloadLimit(
  userId: number,
): OfflineReadLaterAutoDownloadLimit {
  if (typeof localStorage === "undefined") return 0;
  return parseOfflineReadLaterAutoDownloadLimit(
    localStorage.getItem(offlineAutoDownloadKey(userId)),
  );
}

export function setOfflineReadLaterAutoDownloadLimit(
  userId: number,
  limit: OfflineReadLaterAutoDownloadLimit,
): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(offlineAutoDownloadKey(userId), String(limit));
  }
}

export function clearOfflineReadLaterAutoDownloadLimit(userId: number): void {
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(offlineAutoDownloadKey(userId));
  }
}

/** Clears the user-visible local data even if IndexedDB itself has failed. */
export async function clearOfflineDeviceData(userId: number): Promise<number> {
  try {
    return await clearOfflineDataForUser(userId);
  } finally {
    clearOfflineReadLaterAutoDownloadLimit(userId);
    clearOfflineOwner(userId);
  }
}

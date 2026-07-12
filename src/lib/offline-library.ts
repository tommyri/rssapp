import type { ReaderItem } from "@/lib/reader";

const DATABASE_NAME = "rssapp-offline-library";
const STORE_NAME = "articles";
const DATABASE_VERSION = 1;
const OFFLINE_OWNER_KEY = "rssapp:offline-owner";

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
}

export const OFFLINE_READ_LATER_DOWNLOAD_LIMIT = 50;

export function offlineArticleFromReaderItem(
  userId: number,
  item: ReaderItem,
  contentHtml: string,
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
  };
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
): OfflineArticle[] {
  return items.slice(0, limit).flatMap((item) => {
    const contentHtml = item.fullContentHtml ?? item.contentHtml;
    return contentHtml
      ? [offlineArticleFromReaderItem(userId, item, contentHtml)]
      : [];
  });
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

"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useTransition,
} from "react";
import { downloadReadLaterForOfflineAction } from "@/app/actions";
import { ArticleContent } from "@/components/article-content";
import { Button } from "@/components/ui/button";
import { normalizeEmbedLoadingPreferences } from "@/lib/embed-loading";
import {
  getOfflineOwner,
  getOfflineReadLaterAutoDownloadLimit,
  listOfflineArticles,
  OFFLINE_READ_LATER_AUTO_DOWNLOAD_LIMITS,
  OFFLINE_READ_LATER_DOWNLOAD_LIMIT,
  type OfflineArticle,
  type OfflineReadLaterAutoDownloadLimit,
  parseOfflineReadLaterAutoDownloadLimit,
  removeOfflineArticle,
  saveOfflineArticles,
  setOfflineReadLaterAutoDownloadLimit,
} from "@/lib/offline-library";
import {
  type OfflineStatusTone,
  offlineStatusClassName,
} from "@/lib/offline-status";

const offlineEmbedLoading = normalizeEmbedLoadingPreferences(undefined);

interface OfflineStatus {
  message: string;
  tone: OfflineStatusTone;
}

export function OfflineLibraryView() {
  const [articles, setArticles] = useState<OfflineArticle[]>([]);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [onlineEpoch, setOnlineEpoch] = useState(0);
  const [status, setStatus] = useState<OfflineStatus | null>(null);
  const [query, setQuery] = useState("");
  const [autoDownloadLimit, setAutoDownloadLimit] =
    useState<OfflineReadLaterAutoDownloadLimit>(0);
  const [downloading, startDownload] = useTransition();
  const automaticDownloadRun = useRef<string | null>(null);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => {
      setOnline(true);
      setOnlineEpoch((current) => current + 1);
    };
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    const userId = getOfflineOwner();
    setOwnerId(userId);
    setAutoDownloadLimit(
      userId ? getOfflineReadLaterAutoDownloadLimit(userId) : 0,
    );
    if (!userId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    void listOfflineArticles(userId)
      .then((saved) => {
        if (!cancelled) setArticles(saved);
      })
      .catch(() => {
        if (!cancelled)
          setStatus({
            message: "Offline storage is unavailable in this browser.",
            tone: "error",
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const visibleArticles = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return articles;
    return articles.filter((article) =>
      [article.title, article.feedTitle, article.author]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalized),
    );
  }, [articles, query]);

  async function removeArticle(article: OfflineArticle) {
    try {
      await removeOfflineArticle(article.key);
      setArticles((current) =>
        current.filter((item) => item.key !== article.key),
      );
      if (expandedKey === article.key) setExpandedKey(null);
    } catch {
      setStatus({
        message: "Could not remove that offline copy.",
        tone: "error",
      });
    }
  }

  const downloadReadLater = useCallback(
    (limit = OFFLINE_READ_LATER_DOWNLOAD_LIMIT, automatic = false) => {
      if (ownerId === null) {
        setStatus({
          message: "Open the reader while online before downloading articles.",
          tone: "error",
        });
        return;
      }

      setStatus(null);
      startDownload(async () => {
        try {
          const downloaded = await downloadReadLaterForOfflineAction(limit);
          await saveOfflineArticles(downloaded);
          setArticles(await listOfflineArticles(ownerId));
          setStatus({
            message:
              downloaded.length === 0
                ? "None of your Read later articles has readable content to save yet."
                : `${automatic ? "Auto-downloaded" : "Saved"} ${downloaded.length} Read later article${downloaded.length === 1 ? "" : "s"} for offline reading.`,
            tone: "success",
          });
        } catch {
          setStatus({
            message: automatic
              ? "Could not automatically download your Read later articles."
              : "Could not download your Read later articles for offline reading.",
            tone: "error",
          });
        }
      });
    },
    [ownerId],
  );

  useEffect(() => {
    if (
      ownerId === null ||
      !online ||
      loading ||
      downloading ||
      autoDownloadLimit === 0
    ) {
      return;
    }

    const run = `${ownerId}:${autoDownloadLimit}:${onlineEpoch}`;
    if (automaticDownloadRun.current === run) return;
    automaticDownloadRun.current = run;
    downloadReadLater(autoDownloadLimit, true);
  }, [
    autoDownloadLimit,
    downloading,
    downloadReadLater,
    loading,
    online,
    onlineEpoch,
    ownerId,
  ]);

  function updateAutoDownloadLimit(value: string) {
    const limit = parseOfflineReadLaterAutoDownloadLimit(value);
    automaticDownloadRun.current = null;
    setAutoDownloadLimit(limit);
    if (ownerId !== null) {
      setOfflineReadLaterAutoDownloadLimit(ownerId, limit);
    }
  }

  return (
    <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-6 md:px-8">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <h1 className="font-serif text-2xl font-bold tracking-tight">
            Offline library
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {online
              ? "Saved reading copies on this device."
              : "Offline — showing reading copies saved on this device."}
          </p>
        </div>
        {online ? (
          <Link
            href="/"
            className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
          >
            Open reader
          </Link>
        ) : null}
      </div>

      {status ? (
        <output
          className={`mt-4 block text-sm ${offlineStatusClassName(status.tone)}`}
        >
          {status.message}
        </output>
      ) : null}

      {ownerId !== null ? (
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Auto-download Read later</h2>
            <p className="text-xs text-muted-foreground">
              When this library opens or reconnects, refresh a bounded reading
              set on this device.
            </p>
          </div>
          <label>
            <span className="sr-only">Automatically download Read later</span>
            <select
              aria-label="Automatically download Read later"
              value={autoDownloadLimit}
              onChange={(event) => updateAutoDownloadLimit(event.target.value)}
              className="h-8 rounded-md border border-input bg-background px-2 text-sm"
            >
              {OFFLINE_READ_LATER_AUTO_DOWNLOAD_LIMITS.map((limit) => (
                <option key={limit} value={limit}>
                  {limit === 0 ? "Off" : `Latest ${limit}`}
                </option>
              ))}
            </select>
          </label>
        </section>
      ) : null}

      {ownerId !== null && online ? (
        <section className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/30 px-4 py-3">
          <div>
            <h2 className="text-sm font-medium">Download Read later</h2>
            <p className="text-xs text-muted-foreground">
              Save up to 50 readable articles from your current queue on this
              device.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={() => downloadReadLater()}
            disabled={loading || downloading}
          >
            {downloading ? "Downloading…" : "Download Read later"}
          </Button>
        </section>
      ) : null}

      {loading ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Opening offline library…
        </p>
      ) : ownerId === null ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          Open the reader while online to set up offline reading on this device.
        </p>
      ) : articles.length === 0 ? (
        <p className="py-16 text-center text-sm text-muted-foreground">
          No articles saved offline yet. Open an article and choose Keep
          offline, or download your Read later queue.
        </p>
      ) : (
        <>
          <label className="mt-5 block">
            <span className="sr-only">Search offline articles</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search saved offline articles"
              className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
          </label>
          <ul className="mt-4 divide-y divide-border rounded-lg border">
            {visibleArticles.map((article) => {
              const isOpen = expandedKey === article.key;
              return (
                <li key={article.key} className="px-4 py-3">
                  <button
                    type="button"
                    onClick={() => setExpandedKey(isOpen ? null : article.key)}
                    className="w-full text-left"
                  >
                    <span className="block font-serif text-lg font-semibold">
                      {article.title ?? "Untitled article"}
                    </span>
                    <span className="mt-1 block text-xs text-muted-foreground">
                      {[article.feedTitle, article.author]
                        .filter(Boolean)
                        .join(" · ")}
                      {article.publishedAt
                        ? ` · ${new Date(article.publishedAt).toLocaleDateString()}`
                        : ""}
                    </span>
                  </button>
                  {isOpen ? (
                    <div className="pt-4">
                      <ArticleContent
                        html={article.contentHtml}
                        embedLoading={offlineEmbedLoading}
                      />
                      <div className="mt-5 flex flex-wrap gap-2 border-t border-border/60 pt-4">
                        {article.url && online ? (
                          <a
                            href={article.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="rounded-md border border-border/70 px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground"
                          >
                            Open original
                          </a>
                        ) : null}
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => void removeArticle(article)}
                        >
                          Remove offline copy
                        </Button>
                      </div>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {visibleArticles.length === 0 ? (
            <p className="py-10 text-center text-sm text-muted-foreground">
              No offline articles match that search.
            </p>
          ) : null}
        </>
      )}
    </main>
  );
}

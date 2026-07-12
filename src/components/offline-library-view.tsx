"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArticleContent } from "@/components/article-content";
import { Button } from "@/components/ui/button";
import { normalizeEmbedLoadingPreferences } from "@/lib/embed-loading";
import {
  getOfflineOwner,
  listOfflineArticles,
  type OfflineArticle,
  removeOfflineArticle,
} from "@/lib/offline-library";

const offlineEmbedLoading = normalizeEmbedLoadingPreferences(undefined);

export function OfflineLibraryView() {
  const [articles, setArticles] = useState<OfflineArticle[]>([]);
  const [ownerId, setOwnerId] = useState<number | null>(null);
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
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
          setMessage("Offline storage is unavailable in this browser.");
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
      setMessage("Could not remove that offline copy.");
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

      {message ? (
        <output className="mt-4 block text-sm text-destructive">
          {message}
        </output>
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
          No articles saved offline yet. Open an article in the reader and
          choose Keep offline.
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

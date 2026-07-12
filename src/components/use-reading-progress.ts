"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { ReaderItem } from "@/lib/reader";
import {
  readingProgressAtScroll,
  resumableReadingProgress,
  scrollContainerGeometry,
  scrollForReadingProgress,
  storedReadingProgress,
} from "@/lib/reading-progress";

const PERSIST_AFTER_MS = 1_500;

type ProgressItem = Pick<ReaderItem, "id" | "kind" | "readingProgress">;

interface UseReadingProgressOptions {
  item: ProgressItem | null;
  onPersist: (
    item: ProgressItem,
    progress: number | null,
  ) => void | Promise<void>;
}

/**
 * Tracks an inline article against document scroll and resumes its meaningful
 * in-progress position. Persistence is throttled because Server Actions are
 * dispatched sequentially by the client.
 */
export function useReadingProgress({
  item,
  onPersist,
}: UseReadingProgressOptions): {
  articleRef: (node: HTMLDivElement | null) => void;
  progress: number;
} {
  const [article, setArticle] = useState<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);
  const progressRef = useRef(0);
  const persistedRef = useRef<number | null>(null);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemRef = useRef(item);
  itemRef.current = item;
  const onPersistRef = useRef(onPersist);
  onPersistRef.current = onPersist;

  const articleRef = useCallback((node: HTMLDivElement | null) => {
    setArticle(node);
  }, []);
  const itemKey = item ? `${item.kind}:${item.id}` : null;

  useEffect(() => {
    const activeItem = itemRef.current;
    if (!itemKey || !activeItem || !article) {
      progressRef.current = 0;
      setProgress(0);
      return;
    }
    const itemToPersist: ProgressItem = activeItem;
    const articleElement: HTMLDivElement = article;
    const scrollElement =
      articleElement.closest<HTMLElement>("[data-reader-scroll]") ??
      document.documentElement;

    function geometry() {
      const articleRect = articleElement.getBoundingClientRect();
      const containerRect = scrollElement.getBoundingClientRect();
      return scrollContainerGeometry({
        articleTopInViewport: articleRect.top,
        containerTopInViewport: containerRect.top,
        scrollTop: scrollElement.scrollTop,
        articleHeight: articleRect.height,
        viewportHeight: scrollElement.clientHeight,
      });
    }

    const resume = resumableReadingProgress(itemToPersist.readingProgress);
    progressRef.current = resume ?? 0;
    persistedRef.current = resume;
    setProgress(resume ?? 0);

    function persistNow() {
      if (persistTimer.current) {
        clearTimeout(persistTimer.current);
        persistTimer.current = null;
      }
      const next = storedReadingProgress(progressRef.current);
      if (next === persistedRef.current) return;
      persistedRef.current = next;
      void Promise.resolve(onPersistRef.current(itemToPersist, next)).catch(
        () => {
          // Resume state is a convenience; a transient write failure is silent.
        },
      );
    }

    function queuePersist() {
      if (persistTimer.current) return;
      persistTimer.current = setTimeout(persistNow, PERSIST_AFTER_MS);
    }

    function measure() {
      const next = readingProgressAtScroll(geometry());
      if (Math.abs(next - progressRef.current) < 0.01) return;
      progressRef.current = next;
      setProgress(next);
      queuePersist();
    }

    const frame = window.requestAnimationFrame(() => {
      if (resume !== null) {
        scrollElement.scrollTo({
          top: scrollForReadingProgress({ ...geometry(), progress: resume }),
          behavior: "auto",
        });
      }
      measure();
    });
    const onScroll = () => measure();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") persistNow();
    };

    scrollElement.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("pagehide", persistNow);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.cancelAnimationFrame(frame);
      scrollElement.removeEventListener("scroll", onScroll);
      window.removeEventListener("pagehide", persistNow);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      persistNow();
    };
  }, [article, itemKey]);

  return { articleRef, progress };
}

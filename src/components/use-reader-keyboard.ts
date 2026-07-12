"use client";

import {
  type Dispatch,
  type MutableRefObject,
  type SetStateAction,
  useEffect,
} from "react";
import { shouldIgnoreKeyboard } from "@/lib/keyboard";
import type { ReaderItem } from "@/lib/reader";

export interface ReaderKeyboardHandlers {
  toggleRead: (item: ReaderItem) => void;
  toggleStarred: (item: ReaderItem) => void;
  loadFullContent: (item: ReaderItem) => Promise<void>;
  markAll: (olderThanDays: number | null) => Promise<void>;
  markOlderThanCurrent: () => Promise<void>;
}

interface UseReaderKeyboardOptions {
  isArchiveView: boolean;
  isSearch: boolean;
  itemsRef: MutableRefObject<ReaderItem[]>;
  expandedIdRef: MutableRefObject<string | null>;
  focusRequestedRef: MutableRefObject<boolean>;
  loadingContentRef: MutableRefObject<Set<number>>;
  handlersRef: MutableRefObject<ReaderKeyboardHandlers>;
  setFocusRequested: Dispatch<SetStateAction<boolean>>;
  moveBy: (delta: number) => void;
  smartAdvance: () => void;
  keyOf: (item: Pick<ReaderItem, "kind" | "id">) => string;
}

/** Google Reader-style reader controls, kept separate from list state updates. */
export function useReaderKeyboard({
  isArchiveView,
  isSearch,
  itemsRef,
  expandedIdRef,
  focusRequestedRef,
  loadingContentRef,
  handlersRef,
  setFocusRequested,
  moveBy,
  smartAdvance,
  keyOf,
}: UseReaderKeyboardOptions) {
  useEffect(() => {
    function currentItem(): ReaderItem | null {
      return (
        itemsRef.current.find(
          (item) => keyOf(item) === expandedIdRef.current,
        ) ?? null
      );
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && focusRequestedRef.current) {
        event.preventDefault();
        setFocusRequested(false);
        return;
      }
      if (shouldIgnoreKeyboard(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (itemsRef.current.length === 0) return;

      const handlers = handlersRef.current;
      const item = currentItem();

      if (event.shiftKey && event.key.toLowerCase() === "a") {
        if (isSearch || isArchiveView) return;
        event.preventDefault();
        void handlers.markAll(null);
        return;
      }

      switch (event.key) {
        case "j":
          event.preventDefault();
          moveBy(1);
          return;
        case "k":
          event.preventDefault();
          moveBy(-1);
          return;
        case " ":
          event.preventDefault();
          smartAdvance();
          return;
        case "m":
          if (!item) return;
          event.preventDefault();
          handlers.toggleRead(item);
          return;
        case "s":
          if (!item || item.kind !== "item") return;
          event.preventDefault();
          handlers.toggleStarred(item);
          return;
        case "v":
          if (!item?.url) return;
          event.preventDefault();
          window.open(item.url, "_blank", "noopener,noreferrer");
          return;
        case "c":
          if (
            !item ||
            item.kind !== "item" ||
            item.fullContentHtml ||
            !item.url ||
            loadingContentRef.current.has(item.id)
          ) {
            return;
          }
          event.preventDefault();
          void handlers.loadFullContent(item);
          return;
        case "o":
          if (isSearch || isArchiveView) return;
          event.preventDefault();
          void handlers.markOlderThanCurrent();
          return;
        default:
          return;
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    isArchiveView,
    isSearch,
    itemsRef,
    expandedIdRef,
    focusRequestedRef,
    loadingContentRef,
    handlersRef,
    setFocusRequested,
    moveBy,
    smartAdvance,
    keyOf,
  ]);
}

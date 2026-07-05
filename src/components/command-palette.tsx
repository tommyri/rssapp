"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { fuzzyMatch } from "@/lib/fuzzy";

/** Somewhere the palette can jump to: a view, an app page, a folder, or a feed. */
export interface PaletteTarget {
  kind: "view" | "page" | "folder" | "feed";
  label: string;
  href: string;
  /** Extra context shown muted after the label (a feed's folder). */
  hint?: string;
}

interface Scored {
  target: PaletteTarget;
  indices: number[];
}

/**
 * Command palette / quick switcher (docs/features.md v0.2): ⌘K / Ctrl+K opens
 * a fuzzy-filtered jump list of every feed, folder, and view — the multiplier
 * on the keyboard-shortcuts investment. Arrow keys move, Enter jumps, Esc
 * closes. The chord works even while a text field has focus (palette
 * convention — unlike the single-key canon, it can't collide with typing).
 */
export function CommandPalette({ targets }: { targets: PaletteTarget[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLUListElement>(null);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault(); // some browsers bind Ctrl+K themselves
        setOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  // Fresh palette every time it opens.
  function onOpenChange(next: boolean) {
    setOpen(next);
    if (!next) {
      setQuery("");
      setSelected(0);
    }
  }

  const results = useMemo<Scored[]>(() => {
    const scored: (Scored & { score: number })[] = [];
    for (const target of targets) {
      const match = fuzzyMatch(query, target.label);
      if (match) {
        scored.push({ target, score: match.score, indices: match.indices });
      }
    }
    // Stable sort: ties keep the natural order (views, pages, folders, feeds).
    scored.sort((a, b) => b.score - a.score);
    return scored;
  }, [targets, query]);

  // Clamp the selection when the result set shrinks; reset on query change.
  const clamped = Math.min(selected, Math.max(0, results.length - 1));

  function moveBy(delta: number) {
    if (results.length === 0) return;
    const next = (clamped + delta + results.length) % results.length;
    setSelected(next);
    listRef.current?.children[next]?.scrollIntoView({ block: "nearest" });
  }

  function jump(target: PaletteTarget | undefined) {
    if (!target) return;
    onOpenChange(false);
    router.push(target.href);
  }

  function onInputKeyDown(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      moveBy(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      moveBy(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      jump(results[clamped]?.target);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        // Palette placement: pinned near the top instead of centered, flush
        // content. Mobile keeps the default max-w inset; ≥sm widens to lg.
        className="top-24 translate-y-0 gap-0 p-0 sm:max-w-lg"
      >
        <DialogTitle className="sr-only">Jump to feed or view</DialogTitle>
        <input
          type="text"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setSelected(0);
          }}
          onKeyDown={onInputKeyDown}
          placeholder="Jump to feed, folder, or view…"
          aria-label="Jump to feed, folder, or view"
          role="combobox"
          aria-expanded="true"
          aria-controls="command-palette-results"
          aria-activedescendant={
            results[clamped] ? `palette-option-${clamped}` : undefined
          }
          // The palette's own field: the global single-key canon already
          // ignores inputs (shouldIgnoreKeyboard), so typing here is safe.
          className="w-full border-b border-border/60 bg-transparent px-4 py-3 text-sm outline-none placeholder:text-muted-foreground"
        />
        <ul
          id="command-palette-results"
          ref={listRef}
          role="listbox"
          aria-label="Matches"
          className="max-h-[min(50vh,20rem)] overflow-y-auto p-1.5"
        >
          {results.length === 0 ? (
            <li className="px-2.5 py-6 text-center text-sm text-muted-foreground italic">
              No matches.
            </li>
          ) : (
            results.map(({ target, indices }, index) => (
              <li
                key={`${target.kind}:${target.href}`}
                id={`palette-option-${index}`}
                role="option"
                aria-selected={index === clamped}
                className={`flex cursor-pointer items-baseline gap-2 rounded-md px-2.5 py-1.5 text-sm ${
                  index === clamped ? "bg-accent text-accent-foreground" : ""
                }`}
                onMouseMove={() => setSelected(index)}
                onMouseDown={(e) => {
                  e.preventDefault(); // keep focus in the input
                  jump(target);
                }}
              >
                <span className="min-w-0 flex-1 truncate">
                  <Highlighted text={target.label} indices={indices} />
                  {target.hint ? (
                    <span className="ml-2 text-xs text-muted-foreground">
                      {target.hint}
                    </span>
                  ) : null}
                </span>
                <span className="shrink-0 text-xs text-muted-foreground/70">
                  {target.kind}
                </span>
              </li>
            ))
          )}
        </ul>
      </DialogContent>
    </Dialog>
  );
}

/** Label with the fuzzy-matched characters emphasized. */
function Highlighted({ text, indices }: { text: string; indices: number[] }) {
  if (indices.length === 0) return <>{text}</>;
  const matched = new Set(indices);
  return (
    <>
      {[...text].map((ch, i) =>
        matched.has(i) ? (
          // biome-ignore lint/suspicious/noArrayIndexKey: characters of a static string
          <span key={i} className="font-semibold text-primary">
            {ch}
          </span>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: characters of a static string
          <span key={i}>{ch}</span>
        ),
      )}
    </>
  );
}

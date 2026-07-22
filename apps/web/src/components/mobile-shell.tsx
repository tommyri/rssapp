"use client";

import { MenuIcon, XIcon } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { RefreshButton } from "@/components/refresh-button";
import { cn } from "@/lib/utils";

/**
 * Mobile chrome (docs/design-ux.md): below md the feed sidebar becomes a
 * left-slide drawer so the article list is the primary surface, fronted by a
 * slim sticky top bar (menu toggle, brand, refresh). At md+ the very same
 * element is the static sidebar (`md:static`, always in view) — one instance,
 * so nothing in the sidebar is duplicated in the DOM. The sidebar content is
 * passed as children and shared across both layouts.
 */
export function MobileShell({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);
  const pathname = usePathname();
  const searchParams = useSearchParams();

  // Tapping a feed/view navigates — close so the article list is revealed.
  // biome-ignore lint/correctness/useExhaustiveDependencies: close on any navigation
  useEffect(() => setOpen(false), [pathname, searchParams]);

  // Escape closes; move focus into the drawer when it opens (basic drawer a11y).
  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <header
        data-reader-mobile-chrome
        className="flex shrink-0 items-center gap-2 border-b border-sidebar-border bg-sidebar px-3 py-2 text-sidebar-foreground md:hidden"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Open menu"
          aria-expanded={open}
          className="inline-flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <MenuIcon className="size-5" />
        </button>
        <Link href="/" className="font-serif text-xl font-bold tracking-tight">
          rssapp<span className="text-primary">.</span>
        </Link>
        <div className="ml-auto">
          <RefreshButton />
        </div>
      </header>

      {/* Scrim behind the open drawer (mobile only). */}
      {open ? (
        <button
          type="button"
          aria-label="Close menu"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
        />
      ) : null}

      {/* The sidebar: fixed slide-in drawer on mobile, static column at md+. */}
      <aside
        data-reader-navigation
        aria-label="Feeds and navigation"
        className={cn(
          "z-50 flex w-[85%] max-w-xs shrink-0 flex-col overflow-y-auto border-r border-sidebar-border bg-sidebar text-sidebar-foreground",
          "fixed inset-y-0 left-0 shadow-xl transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
          "md:static md:z-auto md:w-72 md:max-w-none md:translate-x-0 md:shadow-none md:transition-none",
        )}
      >
        {/* Mobile-only drawer header — the shared content's brand row is md+ only. */}
        <div className="flex items-center justify-between px-4 pt-4 pb-1 md:hidden">
          <span className="font-serif text-xl font-bold tracking-tight">
            rssapp<span className="text-primary">.</span>
          </span>
          <button
            ref={closeRef}
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
            className="inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent/60 hover:text-foreground"
          >
            <XIcon className="size-4" />
          </button>
        </div>
        {children}
      </aside>
    </>
  );
}

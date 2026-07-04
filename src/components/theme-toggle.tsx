"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";

const CYCLE = ["system", "light", "dark"] as const;
const LABEL: Record<string, string> = {
  system: "◐ Auto",
  light: "☀ Light",
  dark: "☾ Dark",
};

/** Cycles system → light → dark. Follows the OS by default (docs/design-ux.md). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is unknown until mounted; render a placeholder to avoid hydration mismatch.
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";

  function cycle() {
    const index = CYCLE.indexOf(current as (typeof CYCLE)[number]);
    setTheme(CYCLE[(index + 1) % CYCLE.length]);
  }

  return (
    <button
      type="button"
      onClick={cycle}
      title="Theme (follows system by default)"
      className={`rounded-md border border-border/70 px-2 py-1 text-center text-xs text-muted-foreground transition-colors hover:border-border hover:bg-accent/60 hover:text-foreground ${className}`}
    >
      {mounted ? LABEL[current] : "◐ Auto"}
    </button>
  );
}

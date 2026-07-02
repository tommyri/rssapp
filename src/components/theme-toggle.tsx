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
export function ThemeToggle() {
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
      className="text-xs text-muted-foreground underline hover:text-foreground"
    >
      {mounted ? LABEL[current] : "◐ Auto"}
    </button>
  );
}

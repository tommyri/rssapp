"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export type Theme = "system" | "light" | "dark";

// Shared with the pre-hydration script in layout.tsx — keep the two in sync.
export const THEME_STORAGE_KEY = "theme";

interface ThemeContextValue {
  /** The user's setting: follow the system, or force light/dark. */
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function prefersDark(): boolean {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/**
 * Apply the resolved theme to <html>. Mirrors the pre-hydration script in
 * layout.tsx so the two never disagree. `disableTransition` briefly kills CSS
 * transitions so a manual switch doesn't animate every color at once.
 */
function apply(theme: Theme, disableTransition: boolean): void {
  const root = document.documentElement;
  const dark = theme === "dark" || (theme === "system" && prefersDark());

  let killer: HTMLStyleElement | undefined;
  if (disableTransition) {
    killer = document.createElement("style");
    killer.textContent = "*,*::before,*::after{transition:none!important}";
    document.head.appendChild(killer);
  }

  root.classList.toggle("dark", dark);
  root.style.colorScheme = dark ? "dark" : "light";

  if (killer) {
    // Force the class change to paint with transitions off, then restore them.
    void window.getComputedStyle(root).opacity;
    document.head.removeChild(killer);
  }
}

/**
 * Owns the theme setting and the <html> class. The no-flash work is done by
 * ThemeScript during HTML parsing; this only tracks the choice and keeps the
 * class in sync afterwards — it renders no script itself.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  // Server + first client render assume "system" (matching the SSR <html>); the
  // stored value is read on mount, after the inline script already set the class.
  const [theme, setThemeState] = useState<Theme>("system");

  useEffect(() => {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === "light" || stored === "dark" || stored === "system") {
      setThemeState(stored);
    }
  }, []);

  // While following the system, track its changes live.
  useEffect(() => {
    if (theme !== "system") return;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => apply("system", false);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, [theme]);

  const setTheme = useCallback((next: Theme) => {
    localStorage.setItem(THEME_STORAGE_KEY, next);
    setThemeState(next);
    apply(next, true);
  }, []);

  return (
    <ThemeContext.Provider value={{ theme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within a ThemeProvider");
  return ctx;
}

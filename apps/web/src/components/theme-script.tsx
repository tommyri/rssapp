"use client";

// Runs during HTML parsing on a hard load, before the first paint. The script
// itself must mirror the behavior in ThemeProvider.
const THEME_SCRIPT = `(function(){try{var e=document.documentElement,t=localStorage.getItem("theme")||"system",d=t==="dark"||(t==="system"&&matchMedia("(prefers-color-scheme:dark)").matches);e.classList.toggle("dark",d);e.style.colorScheme=d?"dark":"light"}catch(_){}})()`;

export function noFlashScriptType(
  isClient = typeof window !== "undefined",
): "text/javascript" | "text/plain" {
  // React's client renderer deliberately does not execute scripts. Its
  // `text/plain` data-block type is inert and avoids that warning, while SSR
  // emits the executable copy used by the browser during HTML parsing.
  return isClient ? "text/plain" : "text/javascript";
}

/** Executable in SSR, intentionally inert after the app is hydrated. */
export function ThemeScript() {
  return (
    <script type={noFlashScriptType()} suppressHydrationWarning>
      {THEME_SCRIPT}
    </script>
  );
}

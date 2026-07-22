"use client";

import { CheckIcon, MonitorIcon, MoonIcon, SunIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { useTheme } from "@/components/theme-provider";

const OPTIONS = [
  {
    value: "system",
    Icon: MonitorIcon,
    label: "Auto",
    hint: "Match your system",
  },
  { value: "light", Icon: SunIcon, label: "Light", hint: "Always light" },
  { value: "dark", Icon: MoonIcon, label: "Dark", hint: "Always dark" },
] as const;

/** Theme picker. Follows the OS by default (docs/design-ux.md). */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  // Theme is unknown until mounted; fall back to "system" to avoid a mismatch.
  useEffect(() => setMounted(true), []);

  const current = mounted ? (theme ?? "system") : "system";

  return (
    <fieldset className={`m-0 space-y-1.5 border-0 p-0 ${className}`}>
      <legend className="sr-only">Theme</legend>
      {OPTIONS.map(({ value, Icon, label, hint }) => {
        const selected = current === value;
        return (
          <label
            key={value}
            className={`flex w-full cursor-pointer items-center gap-3 rounded-md border px-3 py-2 text-sm transition-colors focus-within:ring-2 focus-within:ring-ring ${
              selected
                ? "border-primary bg-accent/60 text-foreground"
                : "border-border/70 text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground"
            }`}
          >
            <input
              type="radio"
              name="theme"
              value={value}
              checked={selected}
              onChange={() => setTheme(value)}
              className="sr-only"
            />
            <Icon className="size-4 shrink-0" />
            <span className="flex-1">
              <span className="block font-medium">{label}</span>
              <span className="block text-xs text-muted-foreground">
                {hint}
              </span>
            </span>
            {selected ? (
              <CheckIcon className="size-4 shrink-0 text-primary" />
            ) : null}
          </label>
        );
      })}
    </fieldset>
  );
}

"use client";

import { useEffect, useState } from "react";
import {
  DEFAULT_TYPOGRAPHY,
  parseTypography,
  READER_TYPOGRAPHY_KEY,
  type ReaderTypography,
  typographyVars,
} from "@/lib/reader-typography";

/** Write the typography choice to the CSS custom properties .article-content reads. */
function applyTypography(t: ReaderTypography): void {
  const root = document.documentElement;
  for (const [prop, value] of Object.entries(typographyVars(t))) {
    root.style.setProperty(prop, value);
  }
}

/**
 * Applies the saved reader typography on every page load. Mounted from the root
 * layout and renders nothing. No pre-hydration script is needed (unlike theme):
 * `.article-content` only exists once an article is expanded — a client action
 * well after mount — so there's nothing painted early to flash.
 */
export function ReaderTypographyController() {
  useEffect(() => {
    applyTypography(
      parseTypography(localStorage.getItem(READER_TYPOGRAPHY_KEY)),
    );
  }, []);
  return null;
}

const SIZE_OPTIONS = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
] as const;
const FAMILY_OPTIONS = [
  { value: "serif", label: "Serif" },
  { value: "sans", label: "Sans" },
] as const;
const WIDTH_OPTIONS = [
  { value: "narrow", label: "Narrow" },
  { value: "normal", label: "Normal" },
  { value: "wide", label: "Wide" },
] as const;

/** Reader typography picker (Settings). Applies live and remembers the choice. */
export function ReaderTypographyForm() {
  // Start from defaults to match the server render, then load the real value —
  // same mounted-safe pattern as the theme picker (avoids a hydration mismatch).
  const [typ, setTyp] = useState<ReaderTypography>(DEFAULT_TYPOGRAPHY);

  useEffect(() => {
    setTyp(parseTypography(localStorage.getItem(READER_TYPOGRAPHY_KEY)));
  }, []);

  function update(patch: Partial<ReaderTypography>) {
    const next = { ...typ, ...patch };
    setTyp(next);
    localStorage.setItem(READER_TYPOGRAPHY_KEY, JSON.stringify(next));
    applyTypography(next);
  }

  return (
    <section className="space-y-4 rounded-lg border p-4">
      <div className="space-y-1">
        <h3 className="font-medium">Reading text</h3>
        <p className="text-xs text-muted-foreground">
          How the article body reads when expanded.
        </p>
      </div>

      <Segmented
        label="Text size"
        options={SIZE_OPTIONS}
        value={typ.size}
        onChange={(size) => update({ size })}
      />
      <Segmented
        label="Font"
        options={FAMILY_OPTIONS}
        value={typ.family}
        onChange={(family) => update({ family })}
      />
      <Segmented
        label="Column width"
        options={WIDTH_OPTIONS}
        value={typ.width}
        onChange={(width) => update({ width })}
      />

      {/* Live preview — reflects size and font immediately. Column width is
          capped by this narrow settings column, so it shows in the reader. */}
      <div className="space-y-1.5">
        <span className="text-xs text-muted-foreground">Preview</span>
        <div className="rounded-md border border-border/60 bg-card px-3 py-1">
          <div className="article-content">
            <p>
              The quick brown fox jumps over the lazy dog. Typography is the
              craft of making written language legible, readable, and appealing.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

function Segmented<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-1.5">
      <fieldset className="border-0 p-0">
        <legend className="mb-1.5 text-sm">{label}</legend>
        <div className="flex gap-1.5">
          {options.map((opt) => {
            const selected = opt.value === value;
            return (
              <button
                key={opt.value}
                type="button"
                aria-pressed={selected}
                onClick={() => onChange(opt.value)}
                className={`flex-1 rounded-md border px-3 py-1.5 text-sm transition-colors ${
                  selected
                    ? "border-primary bg-accent/60 text-foreground"
                    : "border-border/70 text-muted-foreground hover:border-border hover:bg-accent/40 hover:text-foreground"
                }`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </fieldset>
    </div>
  );
}

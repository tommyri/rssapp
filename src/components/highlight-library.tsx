import { HighlighterIcon } from "lucide-react";
import Link from "next/link";
import type { HighlightSummary } from "@/lib/highlights";

function highlightHref(id: number, notesOnly: boolean): string {
  const params = new URLSearchParams({
    view: "highlights",
    highlight: String(id),
  });
  if (notesOnly) params.set("notes", "1");
  return `/?${params}`;
}

const filterClass =
  "rounded-md px-2.5 py-1.5 text-sm transition-colors hover:bg-accent";

export function HighlightLibrary({
  highlights,
  notesOnly,
  missingHighlight = false,
}: {
  highlights: HighlightSummary[];
  notesOnly: boolean;
  missingHighlight?: boolean;
}) {
  return (
    <section className="py-8">
      <header className="border-b border-border/70 pb-5">
        <div className="flex items-center gap-2 text-primary">
          <HighlighterIcon className="size-5" aria-hidden />
          <h1 className="font-serif text-3xl font-bold text-foreground">
            Highlights
          </h1>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          Revisit passages and notes from across your reading.
        </p>
        <nav aria-label="Highlight filters" className="mt-4 flex gap-1">
          <Link
            href="/?view=highlights"
            className={`${filterClass} ${
              !notesOnly ? "bg-accent font-medium" : "text-muted-foreground"
            }`}
          >
            All highlights
          </Link>
          <Link
            href="/?view=highlights&notes=1"
            className={`${filterClass} ${
              notesOnly ? "bg-accent font-medium" : "text-muted-foreground"
            }`}
          >
            Notes only
          </Link>
        </nav>
      </header>

      {missingHighlight ? (
        <p className="mt-5 rounded-md border border-border bg-muted/35 px-3 py-2 text-sm text-muted-foreground">
          That highlight or its source is no longer available.
        </p>
      ) : null}

      {highlights.length === 0 ? (
        <div className="py-24 text-center">
          <p className="font-serif text-lg text-muted-foreground italic">
            {notesOnly ? "No highlighted notes yet." : "No highlights yet."}
          </p>
          <p className="mt-2 text-sm text-muted-foreground">
            {notesOnly
              ? "Add a note while saving a passage to collect it here."
              : "Select a passage in an open article to save it here."}
          </p>
        </div>
      ) : (
        <ol className="divide-y divide-border/70">
          {highlights.map((highlight) => (
            <li key={highlight.id}>
              <Link
                href={highlightHref(highlight.id, notesOnly)}
                className="group block py-5 transition-colors hover:bg-accent/35"
              >
                <p className="truncate px-1 text-xs text-muted-foreground">
                  {highlight.title ?? "Untitled article"}
                  {highlight.source ? ` · ${highlight.source}` : ""}
                </p>
                <blockquote className="mt-2 border-l-2 border-primary/60 px-3 font-serif text-lg leading-7">
                  {highlight.quote}
                </blockquote>
                {highlight.note ? (
                  <p className="mt-3 px-1 text-sm leading-6 text-muted-foreground">
                    <span className="font-medium text-foreground">Note: </span>
                    {highlight.note}
                  </p>
                ) : (
                  <p className="mt-3 px-1 text-xs text-muted-foreground/70 group-hover:text-muted-foreground">
                    Highlight only
                  </p>
                )}
              </Link>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

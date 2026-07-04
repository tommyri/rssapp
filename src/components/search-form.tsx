import { SearchIcon } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Plain GET form — search is just /?q=…, so it works without JS, is
 * bookmarkable, and the back button leaves search naturally.
 */
export function SearchForm({ query }: { query: string }) {
  return (
    <search>
      <form action="/" method="get">
        <div className="relative">
          <SearchIcon className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search articles…"
            aria-label="Search articles"
            autoComplete="off"
            className="h-8 bg-background pl-8 text-sm"
          />
        </div>
      </form>
    </search>
  );
}

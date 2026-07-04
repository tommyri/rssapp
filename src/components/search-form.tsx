import { Input } from "@/components/ui/input";

/**
 * Plain GET form — search is just /?q=…, so it works without JS, is
 * bookmarkable, and the back button leaves search naturally.
 */
export function SearchForm({ query }: { query: string }) {
  return (
    <form action="/" method="get" role="search">
      <Input
        type="search"
        name="q"
        defaultValue={query}
        placeholder="Search articles…"
        aria-label="Search articles"
        autoComplete="off"
        className="h-8 bg-background text-sm"
      />
    </form>
  );
}

<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Conventions in this codebase (audited against the bundled Next 16 docs, July 2026)

- **Cache Components stays OFF** (`cacheComponents` not set). Every view is per-user,
  session-gated, and must show fresh unread state — the app is deliberately fully
  dynamic under the previous caching model. Don't enable it without a design discussion.
- **`proxy.ts`, not `middleware.ts`** — Next 16 renamed it; ours exports a named `proxy`.
- **Request APIs are async-only** (`await searchParams`, `await headers()`, …).
- **`error.tsx` uses `unstable_retry`**, not `reset` — this version's documented prop.
- **Mutations**: server actions + optimistic client state + `router.refresh()` for
  sidebar counts. `refresh()` from `next/cache` (in-action refresh) is the newer
  single-roundtrip variant — fine to adopt, but don't mix both for one action.
- **Pre-hydration DOM work** (theme no-flash) lives in a server-rendered `<head>`
  script in `layout.tsx` — never render a `<script>` from a Client Component
  (React 19 warns; see `docs/01-app/02-guides/preventing-flash-before-hydration.md`).
- **Favicons use `<img>` on purpose** (arbitrary origins; see `feed-icon.tsx`).
- **No `loading.tsx` on purpose**: feed navigation keeps the previous list visible
  during the transition instead of flashing a skeleton (reader-UX choice).

## Database conventions

- **Changing a generated column drops its indexes, and `db:generate` won't put them
  back.** Postgres cannot alter a generation expression, so drizzle emits
  `drop column` + `add column` — which silently takes every index on that column with
  it. This bit the `search_vector` change in 2026.7.6: search kept returning correct
  results via sequential scans over the whole table, with nothing failing anywhere. After
  generating any migration that touches a generated column, add the `CREATE INDEX`
  statements by hand and confirm with
  `select indexname from pg_indexes where tablename = '…'`.
- **Unread means "no diverging row"**, so it cannot be indexed directly: `item_states` is
  written only when state leaves its default. Anything counting unread has to enumerate
  items and anti-join, which is why the sidebar count is bounded by
  `UNREAD_COUNT_HORIZON_DAYS` rather than scanning an account's whole history. Auto-read
  cannot be switched off, which is what makes that bound exact — keep those two facts
  together if either changes.
- **The reader orders by `coalesce(published_at, created_at)`**, not `published_at`. Index
  the expression (`items_feed_sort_idx`), or a range predicate on it will scan.

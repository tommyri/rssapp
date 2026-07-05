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

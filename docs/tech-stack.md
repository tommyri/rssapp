# Tech Stack

Recommended stack, optimized for: one codebase, boring/durable choices, easy self-hosting, and a background fetcher that's a first-class citizen (the part most "just use serverless" setups get wrong).

## Summary

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | End to end |
| Framework | Next.js (App Router) | UI + API in one app |
| Database | PostgreSQL | Articles, feeds, state; FTS later |
| ORM / migrations | Drizzle | Schema in TS, SQL-first, light |
| Feed fetching | Node worker in-app | `node-cron` scheduler, see below |
| Feed parsing | `rss-parser` | RSS/Atom; small JSON Feed handling ourselves |
| Sanitization | `sanitize-html` | Never render feed HTML unsanitized |
| Content extraction (v1) | `@mozilla/readability` + `linkedom` | For truncated feeds |
| Styling / UI | Tailwind CSS + shadcn/ui | Fast to build, easy to customize |
| Auth | Auth.js (credentials, single user) | Multi-user-ready if we ever want it |
| Validation | Zod | API inputs, feed URL forms |
| Testing | Vitest + Playwright | Unit/parsing tests + a few E2E flows |
| Lint/format | Biome | One tool instead of ESLint+Prettier |
| Deployment | Docker Compose (app + Postgres) | Home server / VPS |

## Rationale for the non-obvious choices

### Next.js over separate frontend + backend
An RSS reader is mostly server-rendered lists with a bit of interactivity. One Next.js app gives us SSR for fast first paint, server actions/route handlers for the API, and one deployable unit. A split SPA + API adds operational overhead with no benefit at this size.

### Postgres over SQLite
SQLite would honestly work for a personal reader, but Postgres buys us: proper full-text search for v1, no write-lock concerns between the web app and the fetcher, and no migration cliff if this grows (multi-user, compat API). Docker Compose makes running it trivial.

### In-process worker over external job queue
Feed polling is the one "always running" part. Plan:

- A scheduler (started via Next.js `instrumentation.ts`, or a separate small Node process in the same image) ticks every minute
- It selects feeds due for refresh (`next_fetch_at <= now`), fetches with concurrency limits and per-host politeness, parses, upserts items
- Failure → exponential backoff stored per feed

No Redis, no BullMQ in the MVP — a `fetch_log` table plus `next_fetch_at` on feeds is our "queue". If we ever need more (content extraction at scale, many users), BullMQ is the designated upgrade path.

**Consequence:** we need a long-running Node server. That rules out Vercel/serverless as the primary target and is why Docker on a home server/VPS is the deployment plan.

### Auth.js even though it's single-user
A hand-rolled password check would do, but Auth.js credentials provider is barely more work, gives us solid session handling, and means "add users" is a schema change, not an auth rewrite.

## Architecture sketch

```
                ┌─────────────────────────────────────────┐
                │              Next.js app                │
  Browser ──────┤  UI (RSC + client islands)              │
                │  Route handlers / server actions (API)  │
                │  Worker: scheduler → fetcher → parser ──┼──► The internet
                └───────────────────┬─────────────────────┘      (feeds)
                                    │
                              PostgreSQL
```

### Core data model

- `users` — single row for now; everything user-owned hangs off it
- `feeds` — url, title, site_url, etag, last_modified, next_fetch_at, error state (shared across users)
- `subscriptions` — user ↔ feed, custom title, folder_id, per-feed settings
- `folders` — per user
- `items` — feed_id, guid (unique per feed), url, title, author, content_html (sanitized), published_at
- `item_states` — user ↔ item: read, starred, timestamps
- `fetch_log` — per-fetch outcome for the feed health view

Splitting `feeds`/`items` (global) from `subscriptions`/`item_states` (per user) costs nothing now and is exactly what multi-user and the Reader-compat API would need. Application code follows the same rule: every query is scoped by the session's `user_id` even while there's only one user (see business-option.md).

One deliberate detail: primary keys are `bigint` identity columns, not UUIDs. The Google Reader–compat API expects int64 item ids (native clients parse them as signed 64-bit integers), so bigint ids keep that future feature a pure API layer instead of an id-migration project. Roughly-increasing ids also give us stable pagination ordering for free.

## Open decisions

1. **Deployment target** — assumed Docker Compose on a home server. If you'd rather use a managed platform (Fly.io, Railway, Hetzner + Coolify), the stack holds; only pure-serverless (Vercel) conflicts with the in-process worker.
2. **shadcn/ui vs. hand-rolled UI** — shadcn assumed for speed. If this app is partly a design playground, we can go custom.
3. ~~**How seriously to take multi-user**~~ — **Decided:** schema and app code are multi-tenant from day one; user-facing multi-user features stay off the roadmap until the business option is exercised. See business-option.md.
4. ~~**Reader-compat API priority**~~ — **Decided:** stays in "later". Tommy reads in Inoreader's own apps (not a native sync client), so there's no personal need; the compat API remains a business-leverage feature only (see business-option.md), and bigint ids keep it cheap whenever we want it.

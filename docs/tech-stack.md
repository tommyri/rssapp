# Tech Stack

The stack in use, chosen for: one codebase, boring/durable choices, easy self-hosting, and a background fetcher that's a first-class citizen (the part most "just use serverless" setups get wrong).

## Summary

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript | End to end |
| Framework | Next.js 16 (App Router) | UI + API in one app |
| Database | PostgreSQL | Articles, feeds, state, full-text search |
| ORM / migrations | Drizzle | Schema in TS, SQL-first, light |
| Feed fetching | In-process Node worker | `setInterval` poller, see below |
| Feed parsing | `rss-parser` | RSS/Atom; small JSON Feed handling ourselves |
| Sanitization | `sanitize-html` | Never render feed HTML unsanitized |
| Content extraction | `@mozilla/readability` + `linkedom` | For truncated feeds |
| Styling / UI | Tailwind CSS v4 + Radix UI (shadcn-style) | Fast to build, easy to customize |
| Auth | Auth.js credentials + account lifecycle | Verified email, recovery, and active-account enforcement |
| Validation | Zod | Server-action inputs, feed URL forms |
| Testing | Vitest | Unit/parsing tests (E2E via Playwright is a later addition) |
| Lint/format | Biome | One tool instead of ESLint+Prettier |
| Deployment | Docker Compose (app + Postgres) | Home server / VPS |

## Rationale for the non-obvious choices

### Next.js over separate frontend + backend
An RSS reader is mostly server-rendered lists with a bit of interactivity. One Next.js app gives us SSR for fast first paint, server actions/route handlers for the API, and one deployable unit. A split SPA + API adds operational overhead with no benefit at this size.

### Postgres over SQLite
SQLite would honestly work for a personal reader, but Postgres buys us: proper full-text search for v1, no write-lock concerns between the web app and the fetcher, and no migration cliff if this grows (multi-user, compat API). Docker Compose makes running it trivial.

### In-process worker over external job queue
Feed polling is the one "always running" part. How it works today:

- A `setInterval` scheduler (`src/lib/scheduler.ts`), started from `instrumentation.ts` — which only runs it in the Node runtime, never the Edge runtime or during builds, via `instrumentation-node.ts` — ticks every 60s (`SCHEDULER_TICK_MS`)
- Each tick selects feeds due for refresh (`next_fetch_at <= now`), fetches a batch with a concurrency limit and conditional GET, parses, upserts items, then runs the auto-mark-read sweep
- Failure → backoff stored per feed (`consecutive_failures`, pushed-out `next_fetch_at`)

No Redis, no BullMQ — a `fetch_log` table plus `next_fetch_at` on feeds is our "queue". If we ever need more (content extraction at scale, many users), BullMQ is the designated upgrade path, claiming rows with `SKIP LOCKED`.

**Consequence:** we need a long-running Node server. That rules out Vercel/serverless as the primary target and is why Docker on a home server/VPS is the deployment plan.

### Auth.js for a real account lifecycle
Auth.js credentials gives us solid session handling while the application owns the
product-specific lifecycle: verified email, one-time recovery links, suspension, and
session revocation. `getCurrentUserId()` re-resolves a JWT against the active account on
every protected request, so a revoked session or suspended account cannot keep reading
just because its cookie has not expired. Public signup verifies the email before a first
sign-in, and onboarding records completion separately so existing readers are never
surprised by the new-user flow. The single deployment owner is selected safely (the first
signup on an empty install, or an explicit operator transfer for a multi-account upgrade)
  and has an owner-only account console. The owner can choose open, invitation-only, or
  closed registration without baking a public-access decision into a deployment; social
  identities and staff roles remain later work.

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

- `users` — product account: email, password hash, verification/status/session lifecycle,
  profile-ready fields, and reader `settings` (e.g. `autoReadDays`). Everything user-owned
  hangs off it.
- `account_tokens` — hashed, one-time, expiring email-verification, email-change, and
  password-reset secrets. Raw tokens exist only in a delivered link.
- `instance_settings` + `account_invites` — the singleton registration policy and
  short-lived, hashed owner-issued signup invitations.
- `feeds` — url, title, site_url, etag, last_modified, next_fetch_at, fetch_interval_minutes, error state (shared across users)
- `subscriptions` — user ↔ feed, custom title, folder_id, per-feed `settings` (`fullContent`, `autoReadDays`, `sortOrder`, `defaultUnreadOnly`)
- `folders` — per user
- `items` — feed_id, guid (unique per feed), url, title, author, content_html (sanitized), full_content_html (Readability, cached), published_at, and a generated `search_vector` (weighted, GIN-indexed)
- `item_states` — user ↔ item: read, starred, read_later, muted, and their timestamps (rows written only when state diverges from default)
- `saved_pages` — per-user "save any link to read later": arbitrary URL (unique per user), a Readability copy (content_html) with a `pending → ready | error` status, read state, and a generated `search_vector`. No feed, so it lives outside `items`; folds into the unified Read later view and search
- `rules` — per-user automation: match by keyword/regex on title/content/author, scoped to one feed or all, action mute/mark_read/star
- `fetch_log` — per-fetch outcome for the feed health view

Splitting `feeds`/`items` (global) from `subscriptions`/`item_states` (per user) costs nothing now and is exactly what multi-user and the Reader-compat API would need. Application code follows the same rule: every query is scoped by the session's `user_id` even while there's only one user (see business-option.md).

One deliberate detail: primary keys are `bigint` identity columns, not UUIDs. The Google Reader–compat API expects int64 item ids (native clients parse them as signed 64-bit integers), so bigint ids keep that future feature a pure API layer instead of an id-migration project. Roughly-increasing ids also give us stable pagination ordering for free.

## Open decisions

1. **Deployment target** — assumed Docker Compose on a home server. If you'd rather use a managed platform (Fly.io, Railway, Hetzner + Coolify), the stack holds; only pure-serverless (Vercel) conflicts with the in-process worker.
2. ~~**shadcn/ui vs. hand-rolled UI**~~ — **Decided:** shadcn-style components built on Radix UI primitives (`src/components/ui/*`), plus `lucide-react` for icons. Fast to ship, fully editable, no runtime lock-in.
3. ~~**How seriously to take multi-user**~~ — **Decided:** schema and app code are
   multi-tenant from day one. Public registration, verified identity, recovery, and
   onboarding are now built. See business-option.md.
4. ~~**Reader-compat API priority**~~ — **Decided:** stays in "later". Tommy reads in Inoreader's own apps (not a native sync client), so there's no personal need; the compat API remains a business-leverage feature only (see business-option.md), and bigint ids keep it cheap whenever we want it.

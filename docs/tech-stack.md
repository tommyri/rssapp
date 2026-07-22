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
| Auth | Auth.js credentials + optional Google OAuth | Verified email, recovery, explicit provider linking, and active-account enforcement |
| Browser push | Web Push + VAPID (`web-push`) | Per-device opt-in for rule-notification delivery; needs a deployed HTTPS origin |
| Outbound email | Resend HTTP API + `@js-temporal/polyfill` scheduling | Verified-account mail, idempotent notification digests, and DST-safe local delivery times |
| Validation | Zod | Server-action inputs, feed URL forms |
| Testing | Vitest | Unit, route, service-worker, and parsing tests; browser E2E remains a future addition |
| Lint/format | Biome | One tool instead of ESLint+Prettier |
| Deployment | Docker Compose + GHCR images (app + Postgres) | GitHub builds immutable Linux images; VPS pulls them into separate staging/production Compose projects |

## Rationale for the non-obvious choices

### Next.js over separate frontend + backend
An RSS reader is mostly server-rendered lists with a bit of interactivity. One Next.js app gives us SSR for fast first paint, server actions/route handlers for the API, and one deployable unit. A split SPA + API adds operational overhead with no benefit at this size.

### Postgres over SQLite
SQLite would honestly work for a personal reader, but Postgres buys us: proper full-text search for v1, no write-lock concerns between the web app and the fetcher, and no migration cliff if this grows (multi-user, compat API). Docker Compose makes running it trivial.

### In-process worker over external job queue
Feed polling is the one "always running" part. How it works today:

- A `setInterval` scheduler (`src/lib/scheduler.ts`), started from `instrumentation.ts` — which only runs it in the Node runtime, never the Edge runtime or during builds, via `instrumentation-node.ts` — ticks every 60s (`SCHEDULER_TICK_MS`)
- Each tick selects feeds due for refresh (`next_fetch_at <= now`), fetches a batch with a concurrency limit and conditional GET, parses and upserts items, applies rule effects for newly ingested articles, then runs the maintenance sweeps
- Failure → backoff stored per feed (`consecutive_failures`, pushed-out `next_fetch_at`)

No Redis, no BullMQ — a `fetch_log` table plus `next_fetch_at` on feeds is our "queue". If we ever need more (content extraction at scale, many users), BullMQ is the designated upgrade path, claiming rows with `SKIP LOCKED`.

**Consequence:** we need a long-running Node server. That rules out Vercel/serverless as the primary target and is why Docker on a home server/VPS is the deployment plan.

### Auth.js for a real account lifecycle
Auth.js gives us solid session handling while the application owns the
product-specific lifecycle: verified email, one-time recovery links, suspension, and
session revocation. `getCurrentUserId()` re-resolves a JWT against the active account on
every protected request, so a revoked session or suspended account cannot keep reading
just because its cookie has not expired. Public signup verifies the email before a first
sign-in, and onboarding records completion separately so existing readers are never
surprised by the new-user flow. The single deployment owner is selected safely (the first
signup on an empty install, or an explicit operator transfer for a multi-account upgrade)
  and has an owner-only account console. The owner can choose open, invitation-only, or
closed registration without baking a public-access decision into a deployment. Google
is optional and maps its stable provider subject to a local account only after an
explicit Settings link (or during new-account creation); a matching email alone is
never used to merge identities. A non-owner can delete their account after explicit
confirmation; database foreign keys remove account-owned data and identity records while
shared feeds and items survive. Each new sign-in also receives an opaque, server-side
session handle. It complements—not replaces—the account's session version: Settings can
revoke a specific active sign-in, while lifecycle events can invalidate every session at
once. Staff roles remain later work.

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

- `users` — product account: email, optional password hash, verification/status/session lifecycle,
  profile-ready fields, and reader `settings` (e.g. `autoReadDays`). Everything user-owned
  hangs off it.
- `account_tokens` — hashed, one-time, expiring email-verification, email-change, and
  password-reset secrets. Raw tokens exist only in a delivered link.
- `instance_settings` + `account_invites` — the singleton registration policy and
  short-lived, hashed owner-issued signup invitations.
- `auth_rate_limits` — transient, salted-hash counters for public account endpoints;
  no raw address or network source is retained.
- `auth_sessions` — opaque, expiring browser sign-in handles, scoped to a user and their
  session generation so individual sessions can be revoked from Settings.
- `account_audit_events` — immutable, indexed operational history for owner actions;
  actor/target IDs are retained while readable details stay narrowly scoped to the event.
  IDs become null when an account is deleted, retaining a generic operational record
  without a live account reference.
- `oauth_identities` + `oauth_intents` — stable external-provider subjects and short-lived,
  hashed, one-time handoffs for explicit account linking or policy-controlled signup.
- `api_access_tokens` — hashed, revocable app passwords for the Google Reader-compatible
  sync API; only the raw value shown once at creation can authenticate a native client.
- `feeds` — url, title, site_url, etag, last_modified, next_fetch_at, fetch_interval_minutes, error state (shared across users)
- `subscriptions` — user ↔ feed, custom title, folder_id, per-feed `settings` (`fullContent`, `autoReadDays`, `sortOrder`, `defaultUnreadOnly`)
- `folders` — per user
- `items` — feed_id, guid (unique per feed), url, title, author, content_html (sanitized), full_content_html (Readability, cached), published_at, and a generated `search_vector` (weighted, GIN-indexed)
- `item_states` — user ↔ item: read, starred, read_later, muted, and their timestamps (rows written only when state diverges from default)
- `item_audio_progress` — per-user, per-item, per-audio-source last meaningful playback position so podcast enclosures resume across signed-in devices
- `labels` + `item_labels` + `saved_page_labels` — per-user organization shared by feed items and saved pages
- `saved_pages` — per-user "save any link to read later": arbitrary URL (unique per user), a Readability copy (content_html) with a `pending → ready | error` status, read state, and a generated `search_vector`. No feed, so it lives outside `items`; folds into the unified Read later view and search
- `rules` — per-user automation: match by keyword/regex on title/content/author, scoped to one feed or all, action mute/mark_read/star/tag/notify
- `notifications` — durable per-user inbox entries, deduplicated by rule and article; stores a rule-match snapshot so future delivery channels share one source of truth
- `notification_digest_settings` — one indexed daily/weekly schedule per account, stored as an IANA timezone plus a local wall-clock preference and UTC next-run instant
- `notification_digest_deliveries` + `notification_digest_items` — retryable delivery jobs and frozen notification membership; unique schedule slots and membership prevent concurrent schedulers or provider retries from duplicating a digest
- `push_subscriptions` — per-account browser/device Web Push endpoints and their encrypted-payload keys; endpoints are unique globally so a shared browser is bound to its active account and expired endpoints can be pruned safely
- `highlights` — per-user quote anchors and optional notes on feed items or saved pages; the stored quote is verified before rendering so a changed article cannot receive a misleading annotation
- `fetch_log` — per-fetch outcome for the feed health view

Splitting `feeds`/`items` (global) from `subscriptions`/`item_states` (per user) keeps one fetch serving every subscriber while isolating reader state correctly. Application code follows the same rule: every query is scoped by the session's `user_id` (see business-option.md).

One deliberate detail: primary keys are `bigint` identity columns, not UUIDs. The shipped Google Reader–compatible API expects int64 item ids (native clients parse them as signed 64-bit integers), so bigint ids kept that sync surface a pure API layer instead of an id-migration project. Roughly-increasing ids also give us stable pagination ordering for free.

## Remaining technical decisions

1. **Deployment target** — Docker Compose on a home server/VPS is the supported path.
   GitHub Actions builds and publishes images to GHCR; staging follows the mutable `edge`
   image while production promotes an immutable SHA or calendar-version tag. Managed
   long-running Node platforms remain viable; pure serverless (for example Vercel)
   conflicts with the in-process scheduler. The package calendar version and source
   commit are baked into `RSSAPP_VERSION` / `RSSAPP_REVISION` and matching OCI labels;
   Compose deliberately cannot override artifact identity from an environment file.
2. **Production notification delivery validation** — browser push and email digests are
   implemented, but both need soak testing on the deployed HTTPS origin with real VAPID
   and Resend configuration. Digest delivery state exposes retries and terminal failure
   without logging message content or full recipient details.
3. **Native sync evolution — decided.** The Google Reader-compatible adapter remains an
   isolated compatibility surface. Currentfold's own mobile clients use a modern,
   versioned `/api/v1` contract backed by shared reader-domain operations; see
   [ADR 0001](adr/0001-product-monorepo-and-native-api.md).

# Currentfold

A focused reader for following, saving, and returning to the open web. See
[docs/](docs/README.md) for the product plan, design decisions, architecture, operations,
and business posture.

## Repository layout

- `apps/web` — the existing Next.js reader, API, scheduler, and database access.
- `apps/ios` — the native SwiftUI reader (introduced incrementally).
- `packages/brand` — approved identity masters and platform-neutral design tokens.
- `packages/api-contract` — the first-party API contract and shared fixtures.
- `docs` — product, design, architecture, and operations documentation.

Root npm commands forward to the appropriate workspace, so existing development and
deployment commands remain stable as more product surfaces are added.

## Stack

Next.js (App Router) + TypeScript · PostgreSQL + Drizzle · Tailwind CSS v4 + shadcn/ui · Biome

## Development

```bash
docker compose up -d db   # Postgres on localhost:5433 (5432 is taken by a local install)
npm run db:migrate        # apply migrations
npm run dev               # http://localhost:3000
```

New deployments accept public signups at **/signup** by default. The deployment owner
can switch registration to invitation-only or temporarily close it from **Accounts**.
Invitations are one-time, email-bound links that expire after seven days. New accounts
verify their email before their first sign-in, then get a short setup flow for importing
OPML, adding a source, choosing a starter feed, or starting empty. Existing reader data
remains scoped to the signed-in account.

The dev database URL defaults to the compose credentials (see
`apps/web/src/db/config.ts`); set
`DATABASE_URL` in a `.env` file to override.

### Auth

Auth.js (credentials, with optional Google OAuth). Config is split for edge compatibility:
`apps/web/src/auth.config.ts` (edge-safe, drives the route-protecting proxy in
`apps/web/src/proxy.ts` — Next 16's successor to `middleware.ts`) and
`apps/web/src/auth.ts` (the providers, which read the DB). `getCurrentUserId()` in
`apps/web/src/lib/current-user.ts` is the single place a
JWT becomes a current, active account: it also rejects suspended accounts and sessions
invalidated by a password reset.

Set **`AUTH_SECRET`** in production (used to sign session JWTs). In dev it falls back to an
insecure constant so the app runs without config — generate a real one with
`npx auth secret` before deploying.

**Optional Google sign-in.** Configure both values below to show **Continue with
Google** on sign-in and sign-up. Add `https://your-domain/api/auth/callback/google`
as an authorized redirect URI in Google Cloud (or
`http://localhost:3000/api/auth/callback/google` locally):

```bash
AUTH_GOOGLE_ID=...
AUTH_GOOGLE_SECRET=...
```

Google accounts use their stable provider subject, never a matching email address, as
their identity. A person with an existing password account must first sign in and choose
**Settings → Account → Connect Google**; this prevents accidental account merges. New
Google accounts follow the same open/invitation-only/closed registration policy and use
Google's verified email, so no separate verification email is needed. Google-only users
can set a local password later from Settings.

**Account email.** Email verification, email changes, and password resets use Resend's
HTTP API (no SMTP dependency). Configure these for production:

```bash
APP_URL=https://reader.example.com
RESEND_API_KEY=re_...
EMAIL_FROM="rssapp <accounts@reader.example.com>"
```

For delivery safety, each account can request each kind of account email at most once
per minute. A failed delivery releases its link immediately so the person can retry.

**Signed-in sessions.** Every new sign-in is recorded separately. In
**Settings → Account**, a person can review the active sign-ins for their reader and
end one or all other sessions without interrupting the one they are using. Sessions
created before this feature are managed after the next sign-in, and all sessions remain
subject to the account-wide revocation that follows a password reset.

`APP_URL` must be an HTTPS absolute URL in production. In development, when Resend is
not configured, the app prints the one-time link to the server log instead. Raw tokens
are never stored in the database; links are single-use and expire.

**Abuse protection.** Failed sign-ins are limited per email address and, when the reverse
proxy provides `X-Forwarded-For`, per network. Signup and password-recovery requests use
the same durable protection. Counters retain only salted hashes and expire within a day;
the recovery response deliberately stays identical whether an address exists or is
temporarily limited. Configure your proxy to overwrite—not trust client-supplied—forwarded
IP headers.

**Account operator.** On a fresh install, the first account claims the deployment-owner
role atomically. A one-account legacy install is promoted automatically; when an upgrade
already has multiple accounts, choose deliberately instead of relying on account age:

```bash
npm run set-owner -- person@example.com
```

Only that owner sees **Accounts** in the reader sidebar and can suspend or restore member
accounts. The owner can transfer ownership only to an active, verified member; the former
and new owner are immediately signed out. Suspension also invalidates a member session;
restoring a member requires a fresh sign-in.

The same **Accounts** console keeps a recent, immutable audit trail of access changes,
ownership handovers, registration-policy edits, and invitation events. It also records a
break-glass ownership transfer made with the command below as a System event.

**Account deletion.** A non-owner can permanently delete their account from
**Settings → Account** by confirming their email, typing `DELETE`, and (when one exists)
their current password. It removes all account-owned reader data and linked sign-in
methods; shared feeds and articles remain for other readers. The current browser also
clears its device-local offline library. Download a backup first—deletion cannot be
undone. A deployment owner must first transfer ownership from **Accounts**.

The command below remains an operational escape hatch. It generates a fresh password,
invalidates all existing sessions for that account, and prints the password once:

```bash
npm run reset-password                    # dev checkout
docker compose exec app node scripts/reset-password.mjs   # production container
```

### Database

- Schema lives in `apps/web/src/db/schema.ts`; the client in
  `apps/web/src/db/index.ts`
- `npm run db:generate` — generate a migration after schema changes
- `npm run db:migrate` — apply migrations
- `npm run db:studio` — browse the database

### Background polling

An in-process scheduler (`apps/web/src/lib/scheduler.ts`, started from
`apps/web/src/instrumentation.ts`)
ticks every 60s, refreshes any feed whose `next_fetch_at` has passed, and reschedules
it. The poll "queue" is just the `feeds.next_fetch_at` column — no Redis/queue. Tune the
tick with `SCHEDULER_TICK_MS` (milliseconds); it runs only in the Node server, not during
builds. It needs the long-running `npm run dev`/`npm start` server — not serverless.

Feeds can be **paused** from the Manage feeds page (feed health): a paused feed keeps
its articles but is skipped by the scheduler and refresh-all until resumed. The same
page flags **quiet** feeds — fetching fine, but nothing new in 90+ days.

### Search

Full-text search (Postgres FTS) across titles, authors, and article bodies — including
Readability-extracted full content. Weighted ranking (title > author > body), websearch
syntax (`"quoted phrases"`, `-exclusions`, `OR`). Muted articles never appear. The index
is a generated `tsvector` column with a GIN index; searches are just `/?q=…`.

Content is indexed with **both English and Norwegian stemmers** and queries are parsed
through both, so inflections match in either language ("bolig" finds "boliger",
"transaction" finds "transactions"). Supporting arbitrary languages is a
scaling/business question — see docs/business-option.md.

### Rules & filters

Per-user automation on `/rules`: match articles by keyword or regex on
title/content/author — scoped to one feed or all — and mute, mark read, star,
label, or add them to the in-app notification inbox.
Rules run at ingest (new items arrive with state already applied). A saved rule can
also be explicitly confirmed against a bounded batch of existing articles; creating a
rule never mutates older items. Muted items vanish from lists and unread counts entirely.
The pure matching engine lives in `apps/web/src/lib/rules/engine.ts` with unit tests
alongside.

### Browser push notifications

The in-app inbox is always the source of truth. A reader can additionally opt a
specific browser/device into push alerts from **Settings → Notifications**. Each feed
refresh is grouped into at most one alert per reader; a single-article alert marks its
matching inbox notification read before going to the article, while a batch opens the
inbox. Nothing is sent until both a
deployment owner has configured VAPID and the reader explicitly enables this device.

Generate a VAPID key pair once and keep it stable—changing it invalidates every existing
browser subscription:

```bash
npx web-push generate-vapid-keys --json
```

Set the resulting values in the deployment environment (the public key is shared only
with opted-in browsers; the private key stays server-side):

```bash
VAPID_SUBJECT=mailto:alerts@reader.example.com
VAPID_PUBLIC_KEY=...
VAPID_PRIVATE_KEY=...
```

Browser push is intentionally disabled in `next dev`, where the app unregisters service
workers to prevent Turbopack's changing modules from becoming stale. Test it with a
production build over HTTPS (or `localhost`).

### Email notification digests

Readers can schedule a daily or weekly summary of unread rule notifications from
**Settings → Notifications**. Delivery uses the verified account address and the
reader's selected IANA timezone. The scheduler stores exact digest membership before
sending, retries transient failures with backoff, and supplies a stable provider
idempotency key. Sending does not mark notifications read; opening an article from the
email does. Each message includes a signed preferences link and RFC 8058 one-click
unsubscribe endpoint.

Digests reuse `APP_URL`, `RESEND_API_KEY`, `EMAIL_FROM`, and `AUTH_SECRET` from account
email setup. `APP_URL` must be the public HTTPS origin in production because it is used
for article and unsubscribe links. In local development without Resend credentials, test
and scheduled messages are printed to the server log.

### Full-content extraction

For truncated feeds, "Load full content" in the article view fetches the article page
and extracts readable content (Readability + linkedom,
`apps/web/src/lib/feeds/extract.ts`).
Results are sanitized like feed content and cached per article. A per-feed
"Always load full content" toggle on `/feeds` extracts automatically at ingest.
The "Open original" link is always available as the escape hatch.

### Read later & saved links

**Read later** keeps posts you want to hold onto even after clearing a feed. It's a
unified view: flagged feed articles (`item_states.read_later`) and **saved web pages**
merged newest-saved-first. Save any link two ways:

- Paste a URL into the field at the top of Read later (`SaveLinkForm` →
  `saveLinkAction`),
  which extracts a readable copy right away.
- Drag the **bookmarklet** from Settings to your bookmarks bar; clicking it on any page
  hits `GET /save?url=…` (`apps/web/src/app/save/route.ts`), saves the link, and bounces to Read
  later. Extraction runs in the background — the scheduler's `sweepPendingSavedPages` tick
  is the backstop.

Saved pages live in a per-user `saved_pages` table (arbitrary URLs have no feed, so they
don't fit `items`). Each gets a Readability-extracted, sanitized copy (`extractReadablePage`
in `apps/web/src/lib/feeds/extract.ts`) with a `pending → ready | error` lifecycle, and is indexed
into full-text search alongside feed articles. Domain logic is in
`apps/web/src/lib/saved-pages.ts`.

### Duplicate filtering

When the same story arrives from several feeds (an aggregator plus the original blog,
overlapping tech feeds), the **All** and **folder** views collapse the copies into one
row, tagged "· also in *the other feeds*". The row carries the group's combined
read/star/save state, so reading any copy clears the story everywhere — reading the
shown row also marks its duplicates read.

Matching is by a normalized **canonical URL** (`canonicalizeUrl` — lowercased host,
tracking params and fragment dropped; the same normalization used for saved links),
stored on `items.canonical_url` at ingest and backfilled for older items at boot
(`backfillCanonicalUrls`, run from `apps/web/src/instrumentation-node.ts` after
migrations). The reader groups by it in a single window pass (`listItemsCollapsed` in
`apps/web/src/lib/reader.ts`),
keeps the earliest copy as the representative, and keyset-paginates on it. Single-feed,
Starred, Read later and Search are never collapsed. On by default; toggle in
**Settings → Reading**.

### First-party API

Currentfold's native product API lives under `/api/v1`. The initial stable slice exposes
service discovery, the current account, subscriptions, a cursor-paginated article
stream, and idempotent batched read-state updates. Its OpenAPI 3.1 contract is maintained
in `packages/api-contract/openapi.json` and served by every installation at
`/api/v1/openapi.json`.

For development, create a revocable app credential in **Settings → Account → Native
reader apps** and send it as `Authorization: Bearer …`. This is an explicit bridge for
the first native implementation; the production iOS sign-in flow will use browser-based
authorization with PKCE instead of asking people to paste a credential. See
[docs/first-party-api.md](docs/first-party-api.md).

### Quality

- `npm run lint` — Biome check
- `npm run format` — Biome format
- `npm test` — Vitest unit tests
- `npm run brand:check` — verify generated web and Swift identity output
- `npm run contract:check` — validate the first-party OpenAPI contract

## Deployment (home server / VPS)

GitHub Actions tests and builds the standalone Docker image, publishes it to GHCR, and
lets a separate staging instance follow `main`. Production only pulls an immutable image
that staging has already tested; it never compiles the app or carries uncommitted Compose
changes. The app still applies database migrations during a successful container boot and
starts its in-process poller normally.

Every published image carries the package calendar version and exact source revision in
its runtime environment and OCI labels. The same identity is visible at the bottom of
Settings and returned by `/api/health`, so a deployed artifact can be identified without
relying on a mutable image tag.

See the [deployment runbook](docs/deployment.md) for the complete first-time VPS setup:
GitHub Actions permissions, a read-only GHCR token and Docker login, protected
environment files, HTTPS proxy ports, staging automation, production promotion, backups,
rollback boundaries, and calendar-versioned GitHub Releases. Docker-based local
development starts with `cp .env.example .env` and:

```bash
docker compose -f compose.yaml -f compose.dev.yaml up -d --build
```

# rssapp

A self-hosted RSS reader web app. See [docs/](docs/README.md) for the full plan: features, tech stack, design/UX decisions, competitive analysis, and business posture.

## Stack

Next.js (App Router) + TypeScript · PostgreSQL + Drizzle · Tailwind CSS v4 + shadcn/ui · Biome

## Development

```bash
docker compose up -d db   # Postgres on localhost:5433 (5432 is taken by a local install)
npm run db:migrate        # apply migrations
npm run dev               # http://localhost:3000
```

Anyone can create an account at **/signup**. New accounts verify their email before
their first sign-in, then get a short setup flow for importing OPML, adding a source,
choosing a starter feed, or starting empty. Existing reader data remains scoped to the
signed-in account.

The dev database URL defaults to the compose credentials (see `src/db/config.ts`); set
`DATABASE_URL` in a `.env` file to override.

### Auth

Auth.js (credentials). Config is split for edge compatibility:
`src/auth.config.ts` (edge-safe, drives the route-protecting proxy in `src/proxy.ts` —
Next 16's successor to `middleware.ts`) and `src/auth.ts` (the Credentials provider, which
reads the DB). `getCurrentUserId()` in `src/lib/current-user.ts` is the single place a
JWT becomes a current, active account: it also rejects suspended accounts and sessions
invalidated by a password reset.

Set **`AUTH_SECRET`** in production (used to sign session JWTs). In dev it falls back to an
insecure constant so the app runs without config — generate a real one with
`npx auth secret` before deploying.

**Account email.** Email verification, email changes, and password resets use Resend's
HTTP API (no SMTP dependency). Configure these for production:

```bash
APP_URL=https://reader.example.com
RESEND_API_KEY=re_...
EMAIL_FROM="rssapp <accounts@reader.example.com>"
```

For delivery safety, each account can request each kind of account email at most once
per minute. A failed delivery releases its link immediately so the person can retry.

`APP_URL` must be an HTTPS absolute URL in production. In development, when Resend is
not configured, the app prints the one-time link to the server log instead. Raw tokens
are never stored in the database; links are single-use and expire.

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

The command below remains an operational escape hatch. It generates a fresh password,
invalidates all existing sessions for that account, and prints the password once:

```bash
npm run reset-password                    # dev checkout
docker compose exec app node scripts/reset-password.mjs   # production container
```

### Database

- Schema lives in `src/db/schema.ts`; the client in `src/db/index.ts`
- `npm run db:generate` — generate a migration after schema changes
- `npm run db:migrate` — apply migrations
- `npm run db:studio` — browse the database

### Background polling

An in-process scheduler (`src/lib/scheduler.ts`, started from `src/instrumentation.ts`)
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
title/content/author — scoped to one feed or all — and mute, mark read, or star them.
Rules run at ingest (new items arrive with state already applied). A saved rule can
also be explicitly confirmed against a bounded batch of existing articles; creating a
rule never mutates older items. Muted items vanish from lists and unread counts entirely.
The pure matching engine lives in `src/lib/rules/engine.ts` with unit tests alongside.

### Full-content extraction

For truncated feeds, "Load full content" in the article view fetches the article page
and extracts readable content (Readability + linkedom, `src/lib/feeds/extract.ts`).
Results are sanitized like feed content and cached per article. A per-feed
"Always load full content" toggle on `/feeds` extracts automatically at ingest.
The "Open original" link is always available as the escape hatch.

### Read later & saved links

**Read later** keeps posts you want to hold onto even after clearing a feed. It's a
unified view: flagged feed articles (`item_states.read_later`) and **saved web pages**
merged newest-saved-first. Save any link two ways:

- Paste a URL into the field at the top of Read later (`SaveLinkForm` → `saveLinkAction`),
  which extracts a readable copy right away.
- Drag the **bookmarklet** from Settings to your bookmarks bar; clicking it on any page
  hits `GET /save?url=…` (`src/app/save/route.ts`), saves the link, and bounces to Read
  later. Extraction runs in the background — the scheduler's `sweepPendingSavedPages` tick
  is the backstop.

Saved pages live in a per-user `saved_pages` table (arbitrary URLs have no feed, so they
don't fit `items`). Each gets a Readability-extracted, sanitized copy (`extractReadablePage`
in `src/lib/feeds/extract.ts`) with a `pending → ready | error` lifecycle, and is indexed
into full-text search alongside feed articles. Domain logic is in `src/lib/saved-pages.ts`.

### Duplicate filtering

When the same story arrives from several feeds (an aggregator plus the original blog,
overlapping tech feeds), the **All** and **folder** views collapse the copies into one
row, tagged "· also in *the other feeds*". The row carries the group's combined
read/star/save state, so reading any copy clears the story everywhere — reading the
shown row also marks its duplicates read.

Matching is by a normalized **canonical URL** (`canonicalizeUrl` — lowercased host,
tracking params and fragment dropped; the same normalization used for saved links),
stored on `items.canonical_url` at ingest and backfilled for older items at boot
(`backfillCanonicalUrls`, run from `instrumentation-node.ts` after migrations). The
reader groups by it in a single window pass (`listItemsCollapsed` in `src/lib/reader.ts`),
keeps the earliest copy as the representative, and keyset-paginates on it. Single-feed,
Starred, Read later and Search are never collapsed. On by default; toggle in
**Settings → Reading**.

### Quality

- `npm run lint` — Biome check
- `npm run format` — Biome format
- `npm test` — Vitest unit tests

## Deployment (home server / VPS)

The whole stack runs from the compose file — the app image builds from the
[Dockerfile](Dockerfile) (Next.js standalone output), migrations apply automatically at
boot, and the in-process poller starts with the server.

```bash
# once: create .env next to compose.yaml
echo "AUTH_SECRET=$(npx auth secret --raw 2>/dev/null || openssl rand -base64 33)" > .env
printf '\nAPP_URL=https://reader.example.com\nRESEND_API_KEY=re_...\nEMAIL_FROM="rssapp <accounts@reader.example.com>"\n' >> .env

docker compose up -d --build    # app on http://<host>:3000 + Postgres
```

- The app **refuses to boot without `AUTH_SECRET`** (it signs the session cookies).
- `APP_PORT=8080` in `.env` changes the published port.
- Upgrades: `git pull && docker compose up -d --build` — migrations run on boot.
- Sign-up is public at `/signup`. New accounts verify their email before signing in, then
  complete a short onboarding flow. Existing accounts are automatically marked complete
  when the onboarding migration runs.
- **Settings → Subscriptions & data** can download a complete, portable JSON backup
  (account data, subscriptions, articles, states, saved pages, labels, rules, and
  highlights; never passwords). A restore assistant validates a backup, compares it with
  the account&apos;s current reader data, then requires explicit confirmation before
  transactionally replacing that reader data. It never merges records and leaves the
  account login alone.
  Compose also writes daily snapshots to the `backup-data` volume, retaining 14 by
  default. Tune `BACKUP_INTERVAL_HOURS` and `BACKUP_RETENTION` in `.env`, and copy
  snapshots out with `docker compose cp app:/backups ./backups`.
- Back up the `db-data` volume (or `pg_dump`) as well; it remains the canonical
  database and is the recovery path for any data not yet supported by JSON restore.

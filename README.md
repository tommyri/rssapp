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

On first visit the app redirects to `/login`; since no account exists yet, it shows a
one-time **create account** form. After that, `/login` is sign-in only (single-user).

The dev database URL defaults to the compose credentials (see `src/db/config.ts`); set
`DATABASE_URL` in a `.env` file to override.

### Auth

Auth.js (credentials, single user). Config is split for edge compatibility:
`src/auth.config.ts` (edge-safe, drives the route-protecting proxy in `src/proxy.ts` —
Next 16's successor to `middleware.ts`) and `src/auth.ts` (the Credentials provider, which
reads the DB). `getCurrentUserId()` in `src/lib/current-user.ts` is the single place the
session becomes a user id.

Set **`AUTH_SECRET`** in production (used to sign session JWTs). In dev it falls back to an
insecure constant so the app runs without config — generate a real one with
`npx auth secret` before deploying.

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
Rules run at ingest (new items arrive with state already applied) and optionally
retroactively on creation. Muted items vanish from lists and unread counts entirely.
The pure matching engine lives in `src/lib/rules/engine.ts` with unit tests alongside.

### Full-content extraction

For truncated feeds, "Load full content" in the article view fetches the article page
and extracts readable content (Readability + linkedom, `src/lib/feeds/extract.ts`).
Results are sanitized like feed content and cached per article. A per-feed
"Always load full content" toggle on `/feeds` extracts automatically at ingest.
The "Open original" link is always available as the escape hatch.

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

docker compose up -d --build    # app on http://<host>:3000 + Postgres
```

- The app **refuses to boot without `AUTH_SECRET`** (it signs the session cookies).
- `APP_PORT=8080` in `.env` changes the published port.
- Upgrades: `git pull && docker compose up -d --build` — migrations run on boot.
- First visit shows the one-time create-account form; after that it's sign-in only.
- Back up the `db-data` volume (or `pg_dump`); that's where everything lives.

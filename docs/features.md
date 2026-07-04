# Features

Phased plan. Each phase should ship as a usable app — MVP alone should be good enough to replace a hosted reader for daily use.

**Status (July 2026):** MVP and v1 are built and in daily use. The "later / ideas" list below is the remaining backlog.

## MVP (v0.1) — daily-drivable reader

*Shipped.*

### Subscriptions
- Add a feed by URL; paste a site URL and autodiscover its feed(s) (`<link rel="alternate">`, plus probing common paths like `/feed`, `/rss.xml`, `/index.xml`)
- Supports RSS 2.0, Atom, and JSON Feed
- Organize feeds into folders (one level is enough)
- Rename/remove feeds
- OPML import and export

### Fetching
- Background polling on a schedule (default 15 min per feed, with automatic backoff on repeated failures)
- Polite fetching: conditional GET (ETag / Last-Modified), gzip, sane User-Agent, per-host rate limiting
- Deduplication by GUID/id with URL fallback, so re-fetches never create duplicates
- Per-feed fetch status: last fetched, last error, backoff on repeated failures

### Reading
- Article list: unread by default, newest first; per-feed, per-folder, and "all" views
- Read/unread: auto-mark on open and mark-read-on-scroll in list views (table stakes; specifically praised Inoreader behavior), manual toggle, mark-all-read (per feed/folder, and "older than X")
- Star/save articles (starred view)
- Read later: save articles to a dedicated queue independent of star and read state, so a feed can be cleared while specific posts are kept; counts shown in the sidebar
- Clean reading: articles expand inline in the list (sanitized HTML, images, code blocks); open original in new tab
- Unread counts per feed/folder in the sidebar

### App basics
- Single-user login (the app will be reachable on the network, so it needs auth)
- Responsive layout that works on a phone browser
- Fast: article list paginates (load-older), no fetch-on-render for content we already have

## v1 — comfort features

*Shipped.*

- **Rules & filters** — auto-mark-read, auto-star/tag, or mute by keyword/author/feed. Promoted from "later" after the competitive analysis: it's the #1 feature Inoreader power users pay for, the only real answer to unread overload, and the core of our "clean UI, powerful underneath" position (see competitive-analysis.md)
- **Full-content extraction** — for truncated feeds, fetch the article page and extract readable content (Readability); per-feed toggle
- **Search** — full-text search across titles and content (Postgres FTS)
- **Account settings** — change email and password in the app (currently only possible via direct database access; single-user means a forgotten password has no reset path)
- **Overload valves** — displayed unread counts cap at "1k+"; mark-all-read with "older than a day/week"; mark-read-on-scroll (on by default, toggleable); auto-mark-read after N days (defaults to 30, overridable globally and per-feed)
- **Dark mode** — follow system, manual override
- **Feed health** — the Manage feeds page shows each feed's article/unread counts, last-fetched time, and failing feeds with their error and consecutive-failure count (silent/redirected detection is a later refinement)
- **Favicons** per feed in the sidebar
- **YouTube channels as feeds** — paste a channel URL and we resolve its native RSS feed; nearly free to build, disproportionately appreciated
- **First-run onboarding** — OPML import front and center, plus a small curated starter list so the empty state is never blank

## Later / ideas (not committed)

- Keyboard shortcuts — the Google Reader canon (j/k, space, m, s, Shift+A, `?` overlay; table in design-ux.md). Demoted from v1 (July 2026): nice-to-have for a single-user app, non-negotiable only if this ever courts migrating power users
- Fever or Google Reader–compatible API so native clients (NetNewsWire, Reeder) can sync against it
- PWA with offline reading
- Multi-user support (the schema is designed to allow this — see tech-stack.md)
- Podcast enclosures (list + play audio attachments)
- Email newsletter → feed bridge (unique inbound address per "feed")
- AI daily digest / article summaries

## Explicitly out of scope

- Social features (sharing, comments, recommendations)
- Crawling sites that don't offer feeds (except v1 full-content extraction of subscribed articles)
- Native mobile apps — the web app (and later the compat API + PWA) covers mobile

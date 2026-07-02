# Features

Phased plan. Each phase should ship as a usable app — MVP alone should be good enough to replace a hosted reader for daily use.

## MVP (v0.1) — daily-drivable reader

### Subscriptions
- Add a feed by URL; paste a site URL and autodiscover its feed(s) (`<link rel="alternate">`, plus probing common paths like `/feed`, `/rss.xml`, `/index.xml`)
- Supports RSS 2.0, Atom, and JSON Feed
- Organize feeds into folders (one level is enough)
- Rename/remove feeds
- OPML import and export

### Fetching
- Background polling on a schedule (default ~15 min, per-feed interval override)
- Polite fetching: conditional GET (ETag / Last-Modified), gzip, sane User-Agent, per-host rate limiting
- Deduplication by GUID/id with URL fallback, so re-fetches never create duplicates
- Per-feed fetch status: last fetched, last error, backoff on repeated failures

### Reading
- Article list: unread by default, newest first; per-feed, per-folder, and "all" views
- Read/unread: auto-mark on open and mark-read-on-scroll in list views (table stakes; specifically praised Inoreader behavior), manual toggle, mark-all-read (per feed/folder, and "older than X")
- Star/save articles (starred view)
- Clean reading pane: sanitized article HTML, images, code blocks; open original in new tab
- Unread counts per feed/folder in the sidebar

### App basics
- Single-user login (the app will be reachable on the network, so it needs auth)
- Responsive layout that works on a phone browser
- Fast: article list paginates/virtualizes, no fetch-on-render for content we already have

## v1 — comfort features

- **Rules & filters** — auto-mark-read, auto-star/tag, or mute by keyword/author/feed. Promoted from "later" after the competitive analysis: it's the #1 feature Inoreader power users pay for, the only real answer to unread overload, and the core of our "clean UI, powerful underneath" position (see competitive-analysis.md)
- **Full-content extraction** — for truncated feeds, fetch the article page and extract readable content (Readability); per-feed toggle
- **Search** — full-text search across titles and content (Postgres FTS)
- **Keyboard shortcuts** — the full Google Reader canon: j/k, space smart-advance, m read, s star, v original, Shift+A mark-all, g-prefix navigation, `/` search, `?` overlay (table in design-ux.md; it's non-negotiable muscle memory for migrating reader users)
- **Overload valves** — displayed unread counts cap at "1k+"; optional auto-mark-read after N days (global + per-feed)
- **Dark mode** — follow system, manual override
- **Feed health view** — which feeds are failing, silent (no posts in N months), or redirected
- **Favicons** per feed in the sidebar
- **YouTube channels as feeds** — paste a channel URL and we resolve its native RSS feed; nearly free to build, disproportionately appreciated
- **First-run onboarding** — OPML import front and center, plus a small curated starter list so the empty state is never blank

## Later / ideas (not committed)

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

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

## v0.2 — planned (next up)

*Planned, not yet built. This list will grow as we scope more features before building anything. Roughly ordered by value-for-effort; the platform/sync items are bigger and may span more than one release.*

### Reading & triage
- **Save any link to read later** *(shipped July 2026)* — save an arbitrary web page by URL (not just items from subscribed feeds), the way Inoreader's read-later / save-web-page works: paste a blog-post link and it's kept for later. Captured from an in-app paste field at the top of Read later and a one-click bookmarklet (drag from Settings; `GET /save?url=…`). Saved pages get a Readability-extracted, sanitized copy (fetched immediately from the paste field, with the scheduler as a backstop for the bookmarklet) and fold into the **Read later** view alongside flagged feed items (unified, newest-saved-first), plus full-text search. Stored in a per-user `saved_pages` table — arbitrary URLs have no feed, so they don't fit the global `items` table.
- **Keyboard shortcuts** *(shipped July 2026)* — the Google Reader canon (`j/k`, `space`, `m`, `s`, `v`, `c`, `Shift+A`, `o`, `g` then `a/s/u`, `/`, `?` help overlay; keymap in design-ux.md). Article actions live in `ArticleList`; search/add-feed focus and navigation in `ReaderGlobalKeyboard`.
- **Mark-read older than the current article** (`o`) *(shipped July 2026)* — NetNewsWire's catch-up primitive, bound to `o` in the keyboard canon. Uses `markAllRead` with an `olderThan` cutoff at the current article's sort time.
- **Per-feed sort & view defaults** *(shipped July 2026)* — oldest-first sort and a per-feed unread-only default via `subscriptions.settings` (`sortOrder`, `defaultUnreadOnly`). Editable in the sidebar feed menu and Manage feeds page; oldest-first applies only to single-feed views (folder/all stay newest-first). Feeds that default to showing all articles use `?show=unread` to filter back to unread-only.
- **Duplicate filtering** — collapse the same story arriving from multiple feeds (we already dedup within a feed by GUID). Inoreader paywalls this, so it's a "free at ours" differentiator.
- **Mobile swipe gestures** — swipe a row to mark read or save (star / read-later); design-ux.md parks this as mobile polish, but it's core to one-handed mobile reading.

### Reading pane polish
- **Reader typography controls** — text size, column width, and serif/sans toggle, remembered (design-ux.md parks these as "later"). Direct quality-of-reading lever.
- **Estimated reading time** — "~5 min" on rows and in the expanded header, from word count. Tiny, proven scanning aid.
- **In-article rendering polish** — lazy-load images, click-to-zoom (lightbox), code-block syntax highlighting, and click-to-load embeds (YouTube/tweets as light placeholders); all within the already-sanitized content.
- **Distraction-free reading mode** — collapse the sidebar/chrome for a full-focus single column.
- **Reading progress + resume** — a thin progress bar and remembered scroll position so long articles resume where you left off.
- **Snooze / resurface** — dismiss an article now and have it come back later (tomorrow/weekend); pairs with Read later.
- **Highlights & notes** (stretch) — highlight passages and jot notes on articles and saved pages; a natural companion to save-any-link.
- **Density + "river" mode** (stretch) — compact/comfortable density and an optional single-column continuous reading mode (both "later" in design-ux.md).

### Navigation & power-user speed
- **Command palette / quick switcher** — fuzzy-jump to any feed, folder, or view from the keyboard; multiplies the keyboard-shortcuts investment.
- **Collapsible + drag-to-organize sidebar** — collapse folders and reorder feeds/folders by drag; the sidebar is static today.
- **Infinite scroll + list virtualization** — auto-load on scroll instead of the "Load older" button, and virtualize the list so large unread counts stay smooth (currently paginated, not virtualized).

### Organization, rules & feed health
- **Tags / labels** — arbitrary labels on items and saved pages, beyond one-level folders; a `tag` rule action is the natural tie-in.
- **Rules v2** — preview/test a rule before saving, a "notify" action, and richer apply-to-existing (builds on `src/lib/rules/engine.ts`).
- **Feed health: silent & paused feeds** — surface feeds with no new items in N months, and let a feed be paused instead of retried forever (builds on `fetch_log` + `consecutive_failures`).

### Accounts & recovery
- **Password reset path** — there's currently no self-serve reset; a forgotten password means editing the database directly. Ship an admin `npm run` reset command now, and email-based reset once outbound SMTP exists.

### Platform & sync (bigger bets)
- **PWA + offline reading** — installable, pull-to-refresh, offline reading of already-fetched articles and saved pages. Pairs naturally with save-any-link.
- **Podcast / audio enclosures** — parse `<enclosure>` audio and play it inline; expands beyond text feeds.
- **Google Reader–compatible API** — sync backend so native clients (NetNewsWire, Reeder) can sync against it; the business-leverage feature from business-option.md. Large — likely its own milestone, tracked here so it isn't lost.

## Later / ideas (not committed)

- Text-to-speech ("Listen to this article") — deferred deliberately: the browser's built-in `SpeechSynthesis` voices are too robotic to be pleasant. Do it with a high-quality AI TTS provider instead (likely BYO-key, matching the AI stance in business-option.md), so revisit when we take on AI features
- Multi-user support (the schema is designed to allow this — see tech-stack.md)
- Email newsletter → feed bridge (unique inbound address per "feed")
- AI daily digest / article summaries

## Explicitly out of scope

- Social features (sharing, comments, recommendations)
- Crawling sites that don't offer feeds (except v1 full-content extraction of subscribed articles)
- Native mobile apps — the web app (and later the compat API + PWA) covers mobile

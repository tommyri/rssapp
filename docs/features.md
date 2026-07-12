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
- **Duplicate filtering** *(shipped July 2026)* — collapse the same story arriving from multiple feeds into one row in the All and folder views, tagged "· also in *the other feeds*"; reading it marks every copy read. Matches on a normalized canonical URL (`canonicalizeUrl`, reused from saved links) stored on `items.canonical_url` at ingest and backfilled for older items at boot; the reader groups by it in a single window pass (`listItemsCollapsed` in `src/lib/reader.ts`), keeping the earliest copy as the representative. On by default, toggle in Settings → Reading. Single-feed, Starred, Read later and Search are never collapsed. We already dedup within a feed by GUID; this is the cross-feed case. Inoreader paywalls it, so it's a "free at ours" differentiator.
- **Mobile swipe gestures** *(shipped July 2026)* — swipe a collapsed row **right to toggle read**, **left to toggle read-later** (the two verbs of our triage flow); the row follows the finger, an icon zone arms at 72px, the action fires on release. Dependency-free: pure gesture math in `src/lib/swipe.ts` (unit-tested — vertical scrolling always wins the intent contest), touch plumbing in `SwipeableRow`. Header-only on purpose so expanded articles keep horizontal code-block scrolling; saved pages only get the read swipe (a destructive Remove behind a swipe is a footgun). Star stays a tap/keyboard verb — two swipe actions is the ceiling before gestures need a legend.

### Reading pane polish
- **Reader typography controls** *(shipped July 2026)* — text size (small/medium/large), body font (serif/sans), and column width (narrow/normal/wide) for the expanded article, in Settings → Reading text with a live preview. Applied as `--reader-*` CSS custom properties that `.article-content` consumes (defaults = the previous fixed styling), persisted to localStorage per device (`src/lib/reader-typography.ts`, unit-tested). No pre-hydration script needed — the article body only renders after a click, so there's nothing to flash. Direct quality-of-reading lever.
- **Estimated reading time** *(shipped July 2026)* — "5 min read" (the Medium convention: no "~", which doubled up punctuation after the separator dot, and "read" keeps it from scanning as a second timestamp) in the meta line on rows and in the expanded header, from the stored content's word count at ~225 wpm (`src/lib/reading-time.ts`), computed client-side from HTML the list already ships. Rounds up; suppressed for stub entries (<30 words) so truncated one-liners don't show a noisy "1 min read"; recomputes from full content once extracted. Tiny, proven scanning aid.
- **In-article rendering polish** *(shipped July 2026)* — **code-block syntax highlighting** (highlight.js common build, auto-detected — the sanitizer strips class attributes so language hints don't survive ingest; dynamically imported only when an expanded article contains a `<pre>`, so prose never pays for it; a restrained three-hue theme in globals.css rather than a stock theme), a **click-to-zoom lightbox** for images (portal-rendered — the row entrance animation's lingering transform would otherwise trap `position: fixed` inside the row), and **deferred embeds** (YouTube, Vimeo, and X posts render as light placeholders by default; Settings → Reading offers a global auto-load preference and per-platform overrides, including for previously stored article HTML). Reading preferences autosave after a brief pause, while account and data operations retain explicit confirmation. **Lazy-load images turned out to be already shipped**: the sanitizer stamps `loading="lazy"` on every `<img>` at ingest (verified 305/305 stored items). All rendering lives in `ArticleContent`, shared by feed items, extracted full content, and saved pages.
- **Distraction-free reading mode** *(shipped July 2026)* — collapse the sidebar/chrome for a full-focus single column. Exit from the reader header or with Escape.
- **Reading progress + resume** *(shipped July 2026)* — a thin progress bar and remembered scroll position so long articles resume where you left off.
- **Highlights & notes** (stretch) — highlight passages and jot notes on articles and saved pages; a natural companion to save-any-link.
- **Density + "river" mode** (stretch) — compact/comfortable density and an optional single-column continuous reading mode (both "later" in design-ux.md).

### Navigation & power-user speed
- **Command palette / quick switcher** *(shipped July 2026)* — `⌘K`/`Ctrl+K` opens a fuzzy-filtered jump list of every feed, folder, view, and app page; arrows + Enter to jump. Available on every page (mounted session-gated from the root layout — `GlobalCommandPalette`), not just the reader. Dependency-free: a pure subsequence matcher with word-start/run bonuses (`src/lib/fuzzy.ts`, unit-tested) over the existing dialog primitives, with matched characters highlighted. The chord works even while typing in a field (unlike the single-key canon, it can't collide). Multiplies the keyboard-shortcuts investment.
- **Collapsible + drag-to-organize sidebar** — collapse folders and reorder feeds/folders by drag; the sidebar is static today.

### Organization, rules & feed health
- **Tags / labels** — arbitrary labels on items and saved pages, beyond one-level folders; a `tag` rule action is the natural tie-in.
- **Rules v2** *(preview shipped July 2026)* — test an unsaved rule against a bounded recent sample, inspect matching articles and its resulting action before saving. Still open: a "notify" action and richer apply-to-existing (builds on `src/lib/rules/engine.ts`).
- **Feed health: silent & paused feeds** *(shipped July 2026)* — Manage feeds flags **quiet** feeds ("last new article 5 months ago": fetches succeed but the newest stored article is older than 90 days — the site stopped publishing, or the feed moved and the URL is a husk) and adds **Pause/Resume**: pausing keeps the feed and its articles but stops fetching (the gentler alternative to unsubscribing a broken feed); paused feeds show a pause icon in the sidebar. Pause lives on `subscriptions.settings.paused` — per-subscription, so it's multi-tenant correct: the scheduler polls a feed while at least one non-paused subscription wants it, and manual refresh-all skips the user's paused feeds. Resuming marks the feed due so it fetches on the next tick. No migration needed; the Save form can't clobber a pause (pinned by a unit test).

### Accounts & recovery
- **Password reset path** — *admin command shipped July 2026*: `npm run reset-password [-- email]` (or `docker compose exec app node scripts/reset-password.mjs` against the production container) generates and prints a fresh password; with one account the email is optional. Plain Node on purpose so the same file runs in the standalone image; hash compatibility with the app is pinned by a unit test. Email-based reset still waits on outbound SMTP.

### Platform & sync (bigger bets)
- **PWA + offline reading** *(foundation shipped July 2026)* — installable app shell and a device-local offline library. Choose **Keep offline** on an article or saved page, then read its sanitized text from `/offline` without a connection. Deliberately not cached: dynamic authenticated reader pages, arbitrary images, and third-party embeds. Still open: automatic download sets, pull-to-refresh, and queued offline mutations/sync.
- **Podcast / audio enclosures** — parse `<enclosure>` audio and play it inline; expands beyond text feeds.
- **Google Reader–compatible API** — sync backend so native clients (NetNewsWire, Reeder) can sync against it; the business-leverage feature from business-option.md. Large — likely its own milestone, tracked here so it isn't lost.

## Later / ideas (not committed)

- Text-to-speech ("Listen to this article") — deferred deliberately: the browser's built-in `SpeechSynthesis` voices are too robotic to be pleasant. Do it with a high-quality AI TTS provider instead (likely BYO-key, matching the AI stance in business-option.md), so revisit when we take on AI features
- Multi-user support (the schema is designed to allow this — see tech-stack.md)
- Email newsletter → feed bridge (unique inbound address per "feed")
- AI daily digest / article summaries
- Snooze / resurface — dismiss an article now and have it resurface to the top of the unread list later (tomorrow/weekend). Deferred: it overlaps our own reading process, where a post is either put in Read later (keep) or read (done, shouldn't come back), so the snooze middle-ground earns little here. Design was scoped (nullable `item_states.snoozed_until`, passive query-time hiding, resurface by sorting on the snooze time) — revisit if the triage/overload pressure ever makes a "not now, ask me later" state worth it.
- Infinite scroll + list virtualization — auto-load older articles on scroll instead of the "Load older" button, and virtualize the list for large unread counts. Deferred: we don't hit long unread lists in practice, and the explicit button is predictable and keyboard-friendly; virtualization also fights the inline-accordion expansion (variable row heights) and the scroll-mark IntersectionObserver. The one worthwhile slice, if it ever bites: auto-load the next page when *keyboard* nav (`j`/space) reaches the end of the loaded set, which currently stops dead at item 50.
- Export & backup to third-party storage — push user data to Dropbox, Google Drive, Proton Drive, etc., plus **automatic OPML backup** on a schedule (the in-process scheduler could snapshot on a cadence). Fits guiding principle #2 (own the data) and the pricing-trust position from competitive-analysis.md — portability is a trust feature for any future hosted product. Scope note: OPML covers subscriptions only; a full export (saved pages, starred, read state) would need a defined JSON dump format. The heavy part is per-provider OAuth + token refresh, so lighter first slices exist: a WebDAV/S3-compatible target, a scheduled backup file written to a mounted volume, or an email-attached OPML once outbound SMTP exists (the same dependency email-based password reset waits on). Today's answer — manual OPML export + backing up the `db-data` volume — covers the personal deployment.

## Explicitly out of scope

- Social features (sharing, comments, recommendations)
- Crawling sites that don't offer feeds (except v1 full-content extraction of subscribed articles)
- Native mobile apps — the web app (and later the compat API + PWA) covers mobile

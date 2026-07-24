# Product roadmap

This is the living product roadmap and concise release record. Every phase must stand on
its own as a useful reader; the current rollout and next candidates are deliberately
separate from shipped work.

**Release status — 24 July 2026:** v0.1, v1.0, **2026.7.1 — Notifications, full text &
reading history**, **2026.7.2 — Deliberate read state**, and **2026.7.3 — Email digests,
build identity & product foundations** are shipped. The next release is not assigned
yet; its candidates are being evaluated below.

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
- Read/unread: auto-mark on open, manual toggle, mark-read-on-scroll in list views, and
  mark-all-read (per feed/folder, and "older than X"). Mark-read-on-scroll is recorded
  here as shipped history, but was removed in 2026.7.2: scrolling must not mutate article
  state.
- Star/save articles (starred view)
- Read later: save articles to a dedicated queue independent of star and read state, so a feed can be cleared while specific posts are kept; counts shown in the sidebar
- Clean reading: articles expand inline in the list (sanitized HTML, images, code blocks); open original in new tab
- Unread counts per feed/folder in the sidebar

### App basics
- Account lifecycle — public email/password sign-up, verified-email state, password
  recovery, account suspension support, server-side session revocation, and a short
  first-run setup flow.
- Responsive layout that works on a phone browser
- Fast: article list paginates (load-older), no fetch-on-render for content we already have

## v1.0 — comfort features

*Shipped.*

- **Rules & filters** — auto-mark-read, auto-star, auto-label, or mute by keyword/author/feed. Promoted from "later" after the competitive analysis: it's the #1 feature Inoreader power users pay for, the only real answer to unread overload, and the core of our "clean UI, powerful underneath" position (see competitive-analysis.md)
- **Full-content extraction** — for truncated feeds, fetch the article page and extract readable content (Readability); per-feed toggle
- **Search** — full-text search across titles and content (Postgres FTS)
- **Account settings** — edit a private profile name, change email through a confirmation
  link, resend verification, and change a password in the app
- **Owner account console** — the one deployment owner can review member accounts and
  suspend or restore access. Either action invalidates the member’s existing sessions;
  the owner can never suspend themself through the UI.
- **Overload valves** — displayed unread counts cap at "1k+"; mark-all-read with "older
  than a day/week"; auto-mark-read after N days (defaults to 30, overridable globally and
  per-feed). The originally shipped mark-read-on-scroll toggle was removed in 2026.7.2.
- **Dark mode** — follow system, manual override
- **Feed health** — the Manage feeds page shows each feed's article/unread counts, last-fetched time, and failing feeds with their error and consecutive-failure count (silent/redirected detection is a later refinement)
- **Favicons** per feed in the sidebar
- **YouTube channels as feeds** — paste a channel URL and we resolve its native RSS feed; nearly free to build, disproportionately appreciated
- **First-run onboarding** — after verified sign-up, OPML import is front and center,
  alongside a one-feed field, a small curated starter list, and an explicit empty-reader
  path

## July 2026 product expansion (post-v1.0)

*Shipped.* This section was formerly labelled “v0.2 — planned.” It is retained as the
grouped record of the substantial reader, account, platform, and sync work delivered in
July 2026.

### Reading & triage
- **Save any link to read later** *(shipped July 2026)* — save an arbitrary web page by URL (not just items from subscribed feeds), the way Inoreader's read-later / save-web-page works: paste a blog-post link and it's kept for later. Captured from an in-app paste field at the top of Read later and a one-click bookmarklet (drag from Settings; `GET /save?url=…`). Saved pages get a Readability-extracted, sanitized copy (fetched immediately from the paste field, with the scheduler as a backstop for the bookmarklet) and fold into the **Read later** view alongside flagged feed items (unified, newest-saved-first), plus full-text search. Stored in a per-user `saved_pages` table — arbitrary URLs have no feed, so they don't fit the global `items` table.
- **Keyboard shortcuts** *(shipped July 2026)* — the Google Reader canon (`j/k`, `space`, `m`, `s`, `v`, `Shift+A`, `o`, `g` then `a/s/u`, `/`, `?` help overlay; keymap in design-ux.md). Article actions live in `ArticleList`; search/add-feed focus and navigation in `ReaderGlobalKeyboard`.
- **Mark-read older than the current article** (`o`) *(shipped July 2026)* — NetNewsWire's catch-up primitive, bound to `o` in the keyboard canon. Uses `markAllRead` with an `olderThan` cutoff at the current article's sort time.
- **Per-feed sort & view defaults** *(shipped July 2026)* — oldest-first sort and a per-feed unread-only default via `subscriptions.settings` (`sortOrder`, `defaultUnreadOnly`). Editable in the sidebar feed menu and Manage feeds page; oldest-first applies only to single-feed views (folder/all stay newest-first). Feeds that default to showing all articles use `?show=unread` to filter back to unread-only.
- **Duplicate filtering** *(shipped July 2026)* — collapse the same story arriving from multiple feeds into one row in the All and folder views, tagged "· also in *the other feeds*"; reading it marks every copy read. Matches on a normalized canonical URL (`canonicalizeUrl`, reused from saved links) stored on `items.canonical_url` at ingest and backfilled for older items at boot; the reader groups by it in a single window pass (`listItemsCollapsed` in `src/lib/reader.ts`), keeping the earliest copy as the representative. On by default, toggle in Settings → Reading. Single-feed, Starred, Read later and Search are never collapsed. We already dedup within a feed by GUID; this is the cross-feed case. Inoreader paywalls it, so it's a "free at ours" differentiator.
- **Mobile swipe gestures** *(shipped July 2026; deliberate-read behavior corrected in
  2026.7.2)* — swipe a collapsed row **left to toggle read-later**. A row that is already
  read can be swiped **right to mark it unread**, but an unread row cannot be swiped
  directly to read; it must be opened or included in a bulk read action. The row follows
  the finger, an icon zone arms at 72px, and the action fires on release. Dependency-free:
  pure gesture math in `src/lib/swipe.ts` (unit-tested — vertical scrolling always wins
  the intent contest), with touch plumbing in `SwipeableRow`. Header-only on purpose so
  expanded articles keep horizontal code-block scrolling. A destructive Remove action
  stays out of saved-page swipes.

### Reading pane polish
- **Reader typography controls** *(shipped July 2026)* — text size (small/medium/large), body font (serif/sans), and column width (narrow/normal/wide) for the expanded article, in Settings → Reading text with a live preview. Applied as `--reader-*` CSS custom properties that `.article-content` consumes (defaults = the previous fixed styling), persisted to localStorage per device (`src/lib/reader-typography.ts`, unit-tested). No pre-hydration script needed — the article body only renders after a click, so there's nothing to flash. Direct quality-of-reading lever.
- **Estimated reading time** *(shipped July 2026)* — "5 min read" (the Medium convention: no "~", which doubled up punctuation after the separator dot, and "read" keeps it from scanning as a second timestamp) in the meta line on rows and in the expanded header, from the stored content's word count at ~225 wpm (`src/lib/reading-time.ts`), computed client-side from HTML the list already ships. Rounds up; suppressed for stub entries (<30 words) so truncated one-liners don't show a noisy "1 min read"; recomputes from full content once extracted. Tiny, proven scanning aid.
- **In-article rendering polish** *(shipped July 2026)* — **code-block syntax highlighting** (highlight.js common build, auto-detected — the sanitizer strips class attributes so language hints don't survive ingest; dynamically imported only when an expanded article contains a `<pre>`, so prose never pays for it; a restrained three-hue theme in globals.css rather than a stock theme), a **click-to-zoom lightbox** for images (portal-rendered — the row entrance animation's lingering transform would otherwise trap `position: fixed` inside the row), and **deferred embeds** (YouTube, Vimeo, and X posts render as light placeholders by default; Settings → Reading offers a global auto-load preference and per-platform overrides, including for previously stored article HTML). Reading preferences autosave after a brief pause, while account and data operations retain explicit confirmation. **Lazy-load images turned out to be already shipped**: the sanitizer stamps `loading="lazy"` on every `<img>` at ingest (verified 305/305 stored items). All rendering lives in `ArticleContent`, shared by feed items, extracted full content, and saved pages.
- **Distraction-free reading mode** *(shipped July 2026)* — collapse the sidebar/chrome for a full-focus single column. Exit from the reader header or with Escape.
- **Reading progress + resume** *(shipped July 2026)* — a thin progress bar and remembered scroll position so long articles resume where you left off.
- **Highlights with optional notes** *(shipped July 2026)* — select prose in an
  expanded feed article or saved page, optionally add a note, then save one
  highlight. The saved passage is always visibly painted; a subtle underline
  distinguishes highlights with a note, and clicking the passage opens that
  note in place for adding, editing, or deletion. Overlapping passages are
  deliberately supported: the shared text gains a stronger treatment and a
  chooser lets readers open either annotation. The sidebar **Highlights**
  library unifies annotations from feed articles and saved pages, supports an
  All/Notes-only filter, and returns to the centered source passage. Anchors
  store both quote and character range, so changed content is never highlighted
  incorrectly.
- **Article-list density** *(shipped July 2026)* — comfortable (the original
  two-line previews) or compact (tighter, one-line-preview rows), saved with
  reading preferences and applied everywhere in the reader.
- **"River" mode** (stretch) — an optional single-column continuous reading
  mode remains a later design-ux exploration.

### Navigation & power-user speed
- **Command palette / quick switcher** *(shipped July 2026)* — `⌘K`/`Ctrl+K` opens a fuzzy-filtered jump list of every feed, folder, view, and app page; arrows + Enter to jump. Available on every page (mounted session-gated from the root layout — `GlobalCommandPalette`), not just the reader. Dependency-free: a pure subsequence matcher with word-start/run bonuses (`src/lib/fuzzy.ts`, unit-tested) over the existing dialog primitives, with matched characters highlighted. The chord works even while typing in a field (unlike the single-key canon, it can't collide). Multiplies the keyboard-shortcuts investment.
- **Keyboard pagination** *(shipped July 2026)* — when `j` or smart-advance `space` reaches the end of the locally loaded reader list, the next page loads and opens automatically. Rapid key presses cannot issue duplicate requests, and the explicit **Load older articles** control remains available for mouse/touch use.
- **Collapsible + drag-to-organize sidebar** *(shipped July 2026)* — folder headers collapse independently and retain that choice across devices; drag a folder or feed row directly to reorder it within its current list. The sidebar uses mouse, long-press touch, and keyboard sorting with a drag preview and animated destination, rather than browser-native drag events. The organization lives in the existing per-user preferences, so it works against already-created databases without a schema migration. Empty folders stay visible so they can be reused from a feed's folder picker.

### Organization, rules & feed health
- **Tags / labels** *(shipped July 2026)* — create, rename, and delete per-user labels; assign them to feed articles and saved web pages from the reading view; open a unified label view from the sidebar; and apply a label automatically through a matching rule. Deleting a label also deletes any rules that apply it.
- **Rules v2** *(shipped July 2026)* — test an unsaved rule against a bounded recent sample, inspect matching articles and its resulting action before saving, then explicitly confirm a bounded apply-to-existing batch on a saved rule. New rules only affect future articles; applying to existing articles scans at most the newest 500 in the rule's scope and reports the result.
- **Rule notifications & inbox** *(in-app inbox shipped July 2026; browser push in production validation; email digests in 2026.7.3)* — a rule can add each matching new article to a durable in-app inbox. The sidebar shows the unread count; opening an alert marks it read and opens its article directly, including muted matches. Matching is deduplicated per rule and article, and Settings → Notifications can stop event collection without disabling other automation. Readers can opt individual browser devices into VAPID-authenticated push delivery or schedule a daily/weekly digest to their verified account email. All channels consume the same notification records rather than re-running rules.
- **Feed health: silent & paused feeds** *(shipped July 2026)* — Manage feeds flags **quiet** feeds ("last new article 5 months ago": fetches succeed but the newest stored article is older than 90 days — the site stopped publishing, or the feed moved and the URL is a husk) and adds **Pause/Resume**: pausing keeps the feed and its articles but stops fetching (the gentler alternative to unsubscribing a broken feed); paused feeds show a pause icon in the sidebar. Pause lives on `subscriptions.settings.paused` — per-subscription, so it's multi-tenant correct: the scheduler polls a feed while at least one non-paused subscription wants it, and manual refresh-all skips the user's paused feeds. Resuming marks the feed due so it fetches on the next tick. No migration needed; the Save form can't clobber a pause (pinned by a unit test).

### Accounts & recovery
- **Verified email + password recovery foundation** *(shipped July 2026)* — one-time,
  hashed, expiring links verify an address, confirm a change of address, and reset a
  password. Resets increment the account's session version, immediately invalidating old
  sessions. In development links go to the server log; production uses Resend with
  `APP_URL`, `RESEND_API_KEY`, and `EMAIL_FROM` configured.
- **Operational password reset** *(shipped July 2026)* — `npm run reset-password [-- email]`
  (or `docker compose exec app node scripts/reset-password.mjs`) remains the break-glass
  path and also invalidates active sessions. Plain Node keeps it available in the
  standalone image; hash compatibility with the app is unit-tested.
- **Public registration + onboarding** *(shipped July 2026)* — anyone can create an
  account, verify their email before the first sign-in, then import OPML, add a source,
  pick curated starter feeds, or continue with an empty reader. The migration marks
  existing accounts complete, so they keep their current path into the reader.
- **Registration policy + invitations** *(shipped July 2026)* — the deployment owner
  can keep the public-signup default, admit only people who receive an email-bound,
  seven-day invitation, or close registration temporarily. One outstanding invitation
  per address keeps resends unambiguous; owners can revoke it before use.
- **Authentication abuse protection** *(shipped July 2026)* — failed sign-ins are
  bounded by hashed address and network counters, while signup and recovery requests
  consume their own short-lived budgets. A successful sign-in clears its address-specific
  failure counter; password recovery always gives the same response to avoid enumeration.
- **Owner audit trail** *(shipped July 2026)* — the Accounts console shows a bounded,
  immutable timeline of suspensions, restorations, ownership handovers, registration
  changes, and invitation events. Each event is written in the same transaction as its
  change; a command-line ownership recovery is captured as a System event.
- **Self-service account deletion** *(shipped July 2026)* — a non-owner can remove their
  account from **Settings → Account** only after entering their email, typing `DELETE`,
  and confirming their current password when applicable. The transaction removes
  account-owned reader data and provider identities while shared feeds and articles stay
  available; current-browser offline copies are cleared immediately afterward. Owners
  must transfer ownership before deletion.
- **Signed-in session controls** *(shipped July 2026)* — every new browser sign-in gets a
  server-verifiable session record. **Settings → Account** lists those active sessions
  and can end one or all others while preserving the current session. The existing
  account-wide session generation remains the emergency revoke-everything control for a
  password reset or operator access change.
- **Optional Google sign-in and explicit linking** *(shipped July 2026)* — deployments
  with `AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` configured offer Google at sign-in and
  signup. Google uses a verified provider email for a new account, still honours open,
  invitation-only, and closed registration, and creates a local password only when the
  person chooses one later. Provider identities are keyed by their stable subject;
  matching an existing account email never links or signs in automatically. Instead,
  people sign in normally and connect Google from **Settings → Account**.

### Platform & sync (bigger bets)
- **PWA + offline reading** *(foundation + Read later download shipped July 2026)* — installable app shell and a device-local offline library. Choose **Keep offline** on an article or saved page, manually download the newest 50 readable **Read later** entries from `/offline`, or select an automatic device-local set of 25, 50, or 100 entries that refreshes when the library opens or reconnects. Automatic entries are reconciled to the selected bound while manually kept copies are retained. Where supported, a selected automatic set also refreshes after the next connection and on the browser's periodic background schedule; opening or reconnecting the library remains the reliable cross-browser fallback. The online reader also supports mobile pull-to-refresh, reusing the normal all-feeds refresh. While offline, locally saved articles can be marked read/unread, starred/unstarred, added/removed from Read later, or pasted into Read later as a web link; those queued changes replay after reconnecting, and browsers that support Background Sync can replay them without an open app. Then read their sanitized text without a connection. Deliberately not cached: dynamic authenticated reader pages, arbitrary images, and third-party embeds. Feed and account configuration remain online-only because their conflicts and destructive changes need immediate server confirmation.
- **Full JSON export, replace restore + scheduled snapshots** *(shipped July 2026)* — Settings → Subscriptions & data downloads a per-user, portable JSON backup of account preferences, subscriptions, feed articles, reading state, saved pages, labels, rules, and highlights (never password hashes or other users' data). A restore assistant server-validates the uploaded document, previews it alongside the current account&apos;s reader data, then requires an acknowledgement before replacing that reader data in one transaction. There is no ambiguous merge mode; the account login remains untouched and device-local offline copies are cleared so queued changes cannot return old state. Docker Compose writes the same document daily to a separate `backup-data` volume with bounded retention; `BACKUP_INTERVAL_HOURS` and `BACKUP_RETENTION` tune it. External destinations (WebDAV/S3/Dropbox/etc.) remain later work because they need OAuth semantics.
- **Podcast / audio playback** *(shipped July 2026)* — recognizes audio attachments in RSS and JSON Feed entries, preserves native audio embedded in article content, and presents a native inline player when an expanded article has an episode to listen to. Each audio source resumes at its own last meaningful position across a person's signed-in devices, with a clear start-over control for enclosures. Feed media remains online-only; offline reading intentionally stores readable text rather than arbitrary audio files.
- **Google Reader–compatible API** *(shipped July 2026)* — native reader apps can connect through a revocable app password to sync subscriptions, folders, article streams, unread counts, read/star/label state, and feed changes. The compatibility protocol remains an adapter over the reader's internal model; Currentfold-owned clients use the versioned first-party API instead of inheriting the legacy wire format. See [greader-api.md](greader-api.md).

## 2026.7.1 — Notifications, full text & reading history

*Shipped 19 July 2026.*

**Goal:** make rule-driven alerts dependable without turning the reader into a noisy
attention machine, while making both article text and a feed's earlier reading history
available without reader configuration friction.

1. **Browser push delivery.** Readers can opt individual devices into push notifications
   for rule alerts. A deployment needs HTTPS and VAPID configuration; the durable in-app
   inbox remains the fallback and source of truth.
2. **Durable automatic full-text extraction.** Every newly ingested article with a usable
   public link is queued for Readability extraction immediately. The feed body is visible
   at once; the scheduler fetches the richer copy in a durable, restart-safe queue with
   bounded global and per-host concurrency, retry/backoff, and a terminal fallback state.
   Feed refreshes must never wait on or fail because a publisher page is slow or blocked.
3. **Safe archive catch-up.** Existing retained articles without a full-text cache enter
   the same queue, prioritizing unread, Read later, and starred material. Canonical
   duplicates share an extraction result instead of re-fetching the same article.
4. **One reading model.** Remove `Load full content`, the per-feed `Always load full
   content` setting/chip, and the `c` shortcut. A failed extraction leaves feed-provided
   content and **Open original** available, with a deliberate retry for transient cases.
5. **Outbound-fetch hardening.** Validate URLs and redirects against private/local targets,
   keep a strict timeout and response-size ceiling, honour publisher backoff, and retain
   sanitization. Automatic extraction must not turn the reader into an unsafe crawler.
6. **Continue into read history.** An individual feed still opens on its unread queue,
   but reaching its end offers **Continue with read history** instead of a dead end. It
   appends a clearly labelled, separately paginated read-only section without resetting
   the unread list or changing the URL; subsequent pages keep loading older read articles.
   The existing header-level **Show read** control remains the deliberate way to restart
   the whole feed in a single chronological all-items view. Keyboard pagination can cross
   the labelled boundary; `j`/smart `space` keep their current load-more behaviour.

See [full-content-by-default.md](full-content-by-default.md) for the engineering model,
failure semantics, and release verification.

The newsletter-to-feed bridge is not part of this release.

## 2026.7.2 — Deliberate read state

**Goal:** repair the core reading workflow with one focused release: scrolling and
pagination are navigation, never read-state mutations.

1. Remove **Mark read on scroll** completely: delete the reader-header control, stored
   preference, intersection-observer batching, and related client state. Scrolling and
   pagination are navigation only and never mutate an article. In the regular reading
   UI, unread articles become read by being opened or through a deliberate **Mark all
   read** batch action; **Mark unread** remains available as an intentional reversal.
   The collapsed-row swipe no longer offers an unread-to-read bypass. Rules and
   age-based retention remain separately configured automation.

## 2026.7.3 — Email digests, build identity & product foundations

**Goal:** deliver a calm, user-controlled summary of unread rule notifications without
requiring readers to keep a browser open or enabling immediate push alerts, while making
the exact deployed app version easy to identify.

*Shipped 24 July 2026.*

1. **Email digests.** Readers can schedule a
   daily or weekly digest of unread rule notifications in their own IANA timezone and
   send a rate-limited test to their verified account email. A durable delivery queue
   freezes exact membership, claims work atomically, retries transient failures with
   backoff, and uses provider idempotency. HTML and plain-text versions itemize the
   newest 20 matches and link to the complete inbox; sending never marks an alert read,
   while opening its signed link does. Signed confirmation and RFC 8058 one-click
   unsubscribe paths turn off only the digest channel. The schedule survives JSON
   backup/restore; historical delivery attempts do not.
2. **Build identity.** Quiet **App information** metadata at the bottom of
   Settings shows the calendar release version and short source revision, with a clear
   local-development fallback. CI bakes both values into the immutable image and its OCI
   labels, rather than accepting mutable deployment configuration. `/api/health` returns
   the same non-sensitive version and full revision even when database readiness fails,
   so support and deployment checks can identify the exact running artifact.
3. **Multi-client product foundation.** The
   repository is now an npm-workspace product monorepo: `apps/web` remains the deployed
   Next.js service, `packages/brand` generates shared web and Swift identity assets, and
   `packages/api-contract` owns an OpenAPI 3.1 contract plus cross-platform fixtures.
   The first `/api/v1` slice covers service discovery, account identity,
   subscriptions, cursor-paginated articles, and batched read-state changes. A native
   SwiftUI iOS 17 shell consumes those packages with native sign-in, registration,
   verification and recovery; short-lived access tokens; rotating Keychain refresh
   credentials; web-visible device-session revocation; Universal Link handoff;
   Library/Sources/Settings navigation; pagination; refresh; and native article detail.
   Native Apple/Google authorization now uses the platform/system surfaces, server-side
   proof verification, stable provider subjects, and the same rotating device sessions;
   unconfigured providers stay hidden. Sign in with Apple is deliberately disabled
   until a paid Apple Developer Program membership is active and its complete credential
   lifecycle is production-ready. It remains an internal foundation, not an App Store
   release: complete offline reader workflows, signed-device testing, and distribution
   setup remain prerequisites for external testing. See
   [Sign in with Apple readiness](sign-in-with-apple.md),
   [ADR 0001](adr/0001-product-monorepo-and-native-api.md),
   [ADR 0002](adr/0002-native-account-authentication.md), and
   [first-party-api.md](first-party-api.md).

## Next release candidates

These observations came from production use of 2026.7.3. They are intentionally not
assigned a version until their product shape and priority are agreed.

1. **Complete native read-state parity and freshness.** The iOS reader can mark an
   article read but cannot deliberately mark it unread again. Add that reversal wherever
   the native reader exposes article actions. A write made in iOS already persists and
   appears after reloading the web app; the open web client should also refresh
   cross-client state on window focus and at a restrained visible-page interval, without
   requiring a full real-time socket system.
2. **Put the most useful rule actions first.** A new rule should default to **Star**,
   with **Add to notifications** immediately after it in the action list. Testing a rule
   must continue to preserve the draft action and pattern.
3. **Reconsider digests as a reading roundup.** A weekly email containing only rule
   notifications has a weak purpose. Explore one deduplicated, user-controlled roundup
   of explicitly important unread material: notification-rule matches, Read later
   entries, and starred articles. The email should help a reader return to things they
   already signalled they care about, not become an opaque recommendation algorithm or
   a dump of every unread feed item. Decide section controls, scheduling, eligibility,
   ordering, and migration from the current notification-only digest before building it.
4. **Progressively disclose long source lists.** In each expanded sidebar source group,
   show a small useful initial set—approximately five rows—then a clear **Show N more**
   control and a way to collapse it again. Keep the active source visible, retain folder
   collapse and drag ordering, and avoid hiding unread totals or making keyboard
   navigation unpredictable.

## Later / version undecided

These are useful product possibilities, but none has a release assignment or delivery
promise. A later version gets a scoped goal before one of them becomes planned work.

1. **Read-later extraction live refresh (next UX-fix candidate)** — an article saved
   through the **Save to RSS app** bookmark currently remains on **Fetching a readable
   copy…** until the reader manually reloads the page, even after extraction has
   completed. The open article should detect the completed background fetch and replace
   the pending state with the readable content automatically. A terminal extraction
   failure should likewise replace the pending message with a clear failure state; no
   manual reload should be required in either case.
2. **Durable saved copies (parked)** — consider preserving an immutable, private
   readable copy when a reader explicitly keeps an article, including selected local
   assets so it survives source deletion or link rot. PDF should be an optional export,
   not the canonical archive. This needs deliberate storage, quota, safety, commercial,
   and legal decisions before it receives a release; see
   [durable-saved-copies.md](durable-saved-copies.md).
3. **Currentfold rebrand and clean deployment** — finish replacing the temporary RSS
   App identity with the approved Currentfold name and visual system across the public
   product and active internal stack: repository, package/image, Compose resources,
   database/volume, VPS paths, backup format, browser storage, and protocol identifiers.
   Deploy on a dedicated domain with a verified Resend subdomain and Cloudflare in front
   of the VPS. There are no external users, so the old domain is retired without a
   redirect and current personal data can move once through PostgreSQL dump/restore or
   be discarded for a fresh start. Production cutover work begins after the remaining
   domain/availability and data-transition decision gate is settled; see
   [brand-identity.md](brand-identity.md) and
   [brand-domain-migration.md](brand-domain-migration.md).
4. **Native iOS productization** — grow the internal SwiftUI foundation into an
   externally testable reader: Read later and saved pages, full article state/progress,
   resilient offline sync and queued mutations, highlights/notes, Apple
   deletion-time authorization revocation, accessibility and device testing, and a
   signed TestFlight build.
   Build complete reader workflows through `/api/v1`; do not expose Drizzle records or
   stretch the Google Reader adapter into a first-party product API. Sign in with Apple
   remains a version-undecided, membership-blocked part of this work; its external,
   server-lifecycle, email-relay, deployment, and validation tasks are tracked in
   [sign-in-with-apple.md](sign-in-with-apple.md).
5. **Email newsletter → feed bridge** — a unique inbound address per feed. This is a
   paid-product-shaped differentiator, but is deliberately deferred to an undecided
   later version. It requires an inbound-email provider/webhook, opaque addresses,
   sender and size controls, spam/abuse protections, and safe failure handling before it
   is ready.
6. **Text-to-speech (“Listen to this article”)** — defer browser `SpeechSynthesis`;
   revisit with a high-quality AI TTS provider, likely BYO-key, when we deliberately take
   on AI features.
7. **AI daily digest / article summaries** — a companion to the reading workflow, also
   likely BYO-key so product costs stay explicit.
8. **Snooze / resurface** — dismiss an article now and have it resurface to the top of
   the unread list later (tomorrow/weekend). Deferred: it overlaps our own reading
   process, where a post is either put in Read later (keep) or read (done, shouldn't
   come back), so the snooze middle-ground earns little here. Design was scoped
   (nullable `item_states.snoozed_until`, passive query-time hiding, resurface by
   sorting on the snooze time) — revisit if the triage/overload pressure ever makes a
   “not now, ask me later” state worth it.
9. **Infinite scroll + list virtualization** — auto-load older articles on scroll
   instead of the “Load older” button, and virtualize the list for large unread counts.
   Deferred: we don't hit long unread lists in practice, and the explicit button is
   predictable and keyboard-friendly; virtualization also fights the inline-accordion
   expansion (variable row heights) and the scroll-mark `IntersectionObserver`.

## Explicitly out of scope

- Social features (sharing, comments, recommendations)
- Crawling sites that don't offer feeds (except v1 full-content extraction of subscribed articles)
- An Android client before the iOS product and first-party API have proven the native
  workflow and sync model

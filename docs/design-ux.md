# Design & UX

Decisions for the interface, distilled from a UX survey of the current reader landscape (July 2026). North star: **Feedbin's restraint with Inoreader's power underneath** — the same wedge as the feature plan. Feedbin is the consensus "most beautiful web reader" and the proof that a web app can be the best mobile experience too; we copy its philosophy, not its pixels.

## Layout: sidebar + list, article opens inline

What we shipped is a two-pane shell — sidebar (feeds/folders) → article list — where clicking an article **expands it inline in the list** (accordion: the row becomes the full article, only one open at a time) rather than opening a separate third reading pane. The classic three-pane layout (sidebar → list → reading pane) is what every migrating reader user knows (NetNewsWire established it in 2002, Google Reader cemented it, even Reeder's 2024 redesign kept the skeleton), but for a single reader on a centered max-width column, inline expansion keeps scan position and reading in one place and avoids a perpetually-empty third column. A separate reading pane stays a possible later option if it earns its keep.

- **Mobile / narrow:** the layout is responsive — the sidebar gives way to the list as the primary surface, and articles expand in place. No separate full-screen article drill-down for now.
- **Later option, not now:** a single-column "river" reading mode. There's a real 2026 zeitgeist around pressure-free timeline readers (new Reeder, Current, Tapestry), but the HN reader census shows inbox-style users are still the bulk of the audience — and we are one.

## Article list rows

Follow the NetNewsWire timeline recipe (the best-documented design reasoning in the category — inessential.com, 2018):

- Row = leading unread dot, **bold title** (with inline star / read-later markers), lighter 1–2 line snippet, and a meta line (feed · relative time · author); generous ellipsizing. Per-feed favicons live in the sidebar, not the row
- **Colored dot for unread** — the de-facto convention (NNW, Reeder, Feedbin); ours is the primary accent
- **No auto-extracted thumbnails.** NNW documents the failure modes: cropped faces, social-share icons, tracking pixels picked by mistake. If we ever add thumbnails it's per-feed opt-in for image-heavy feeds
- No grid lines; whitespace separation reads more "publication," less "spreadsheet"
- **Reader-selectable density** — Comfortable preserves the original two-line
  preview rows; Compact tightens rows and uses one-line previews for faster
  scanning. This is an account preference in Reading settings; opening an
  article always keeps the comfortable reading layout.
- **Highlights are one annotation, with an optional note** — selecting prose
  opens one compact composer: save the highlight immediately or add a note
  before saving. A note is not a second object or competing action. Every saved
  highlight stays visibly painted in the article; highlights with a note receive
  a subtle underline, and clicking any highlighted passage opens its note in
  place to add, edit, or delete it. Overlapping highlights are allowed: their
  shared text has a stronger treatment and opens a chooser with each passage,
  so a paragraph and a sentence within it remain independently reachable. The
  stored quote must match its character range before it is rendered, avoiding
  misleading highlights if a feed later changes its text. The Highlights
  sidebar view is the durable return path: it groups annotations by recency,
  can narrow to notes, and opens the source directly at the saved passage.
- **Controls use the shared hierarchy** — a commit action uses the standard
  primary `Button`; secondary actions use an existing secondary/outline
  variant; low-emphasis dismissals use a ghost or icon button. New one-off
  button styling needs a specific interaction reason, not merely local layout.
- **Per-feed settings** live on the `subscriptions.settings` column. Shipped: full-content default, auto-read-days override, **sort order** (newest vs oldest first), and **unread-only by default** (feeds can open on all articles instead).

Sorting: newest-first globally and for folder/all views. A feed can opt into oldest-first so nothing gets buried; pagination follows the chosen order.

## Reading (inline-expanded article)

- Article opens in place within a centered max-width column; generous margins. Opening an unread article auto-marks it read
- **System font stack by default** — Feedbin deliberately moved off font-CDNs for privacy; we get the same result for free. Settings now offers reader text size, serif/sans body font, and narrow/normal/wide reading columns without changing that default
- Sanitized article HTML; images constrained to column width; **full-content extraction** via a "Load full content" button in the expanded article, plus a per-feed "always load full content" default that extracts at ingest (the UX consensus across Miniflux `d`, Feedbin `c`, NNW Reader View)
- **Open original** is always one tap away (a link in the expanded article)
- **Keyboard shortcuts** (shipped July 2026): the Google Reader canon — `j`/`k`, `space`, `m`, `s`, `v`, `c`, bulk-read keys, `g`-chords, `/`, `?` (full keymap below)

## Read later & saved links

**Read later** is the "keep this, I'll clear the feed" queue — deliberately unified so there's one place for things to read, not two. It merges flagged feed articles with **saved web pages** (any URL, not just subscribed items), newest-saved-first. Rationale: Inoreader-style save-a-link is the most-requested read-later capability, and splitting it from feed read-laters would just be two lists doing the same job.

- **Two capture paths, one destination:** a paste field at the top of the Read later view (immediate readable-copy extraction) and a drag-to-bookmark **bookmarklet** from Settings (`/save?url=…`, extraction deferred to the background poller). Both mirror how Instapaper/Inoreader let you save from anywhere.
- **Saved pages read like articles:** a Readability-extracted, sanitized copy renders inline exactly like feed content; "Open original" is always there. A saved page shows a link marker and a `saved <time>` meta line; while its copy is still being fetched it reads "Fetching a readable copy…", and a failed fetch offers **Retry**.
- **Same triage verbs:** mark read/unread and open-marks-read behave as elsewhere; the read-later-only action is **Remove** (delete the saved page) rather than un-flag. Saved pages are excluded from mark-read-on-scroll (they aren't feed unread).

## Unread & overload management

Philosophy: we're building for "inbox people" (counts, j/k, mark-all-read) but the research on unread anxiety is real — so ship the count, and ship every escape hatch:

- **Cap displayed counts at "1k+"** (shipped) — Feedly's vague number is documented as less stressful than an exact one
- **Mark-all-read** (shipped) with "older than a day/week" variants (Feedly). **`o`** = mark-older-than-current-article (NNW's catch-up primitive; shipped with keyboard shortcuts)
- **Mark-read-on-scroll: on by default, toggle to disable** (shipped). It's praised Inoreader behavior and Tommy's habit — but it has articulate haters (birchtree.me), so it must never be unchangeable
- **Auto-mark-read after N days** (shipped): global default of **30 days** (matching Feedly's silent behavior), overridable per feed. High-volume feeds shouldn't accumulate guilt
- Rules/filters (v1) are the real overload answer — and per the Miniflux complaint ("regex-only"), the rules UI must be **keyword-first with regex as the advanced option**

## Keyboard shortcuts *(shipped July 2026)*

The Google Reader inheritance is non-negotiable muscle memory for anyone migrating from Feedbin/Inoreader/Feedly/NewsBlur. Press **`?`** in the reader for the overlay; bindings are ignored while focus is in a text field.

| Key | Action |
|---|---|
| `j` / `k` | next / previous article |
| `space` | smart advance (scroll, then next unread) |
| `m` | toggle read/unread |
| `s` | star |
| `v` | open original in new tab |
| `c` | toggle full-content extraction |
| `Shift+A` | mark all read (with older-than options) |
| `o` | mark older articles read |
| `g` then `a`/`s`/`u` | go to all / starred / unread |
| `a` | add subscription |
| `/` | search (never rebind to AI — Feedly did, users hated it) |
| `⌘K` / `Ctrl+K` | command palette — fuzzy-jump to any feed, folder, or view *(shipped July 2026)* |
| `?` | shortcut help overlay |

## Onboarding & empty states

- **OPML import on the first-run screen** — it's the switching lubricant; every product treats it as day-one table stakes
- Add-feed accepts any site URL: autodiscovery via `<link rel="alternate">`, then probe common paths (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`), JSON Feed included
- Nobody praises a blank "no feeds yet" screen. Shipped: the empty state pairs OPML import with a small curated starter list of feeds to add in one click

## Manage feeds page *(decluttered July 2026)*

Read by default, edit on demand: each feed is a compact two-line row — favicon + title
+ status badges (quiet / failing ×N / paused), then vitals (`4 unread of 212 · fetched
12m ago`) with **non-default settings as chips** (`full content`, `oldest first`,
`auto-read 14d`; a default-configured feed shows none) — grouped under the sidebar's
folder headers. The edit form (and the feed URL, and Unsubscribe) disclose per row
behind **Edit**; the always-open six-control form was the clutter. Unsubscribe lives
inside the edit panel on purpose: rarest action, destructive, shouldn't sit on every
row. Badges stay in-palette — quiet is a neutral outlined pill (informational), failing
gets the destructive tint (action needed) — no amber; one accent is the system.

## Settings page *(categorized July 2026)*

Master-detail: a category rail (desktop) / pills (mobile) on the left, and **one
category's settings** rendered at a time — **Reading** (behavior), **Appearance**
(presentation), **Notifications** (rule inbox and browser-device delivery),
**Subscriptions & data** (portability), **Account** (identity). The
selector is URL-driven (`/settings?section=appearance`, unknown values fall back to the
first) so refresh, back-button, and the ⌘K palette (`Settings · Appearance`) all land
on the right category; links pass `scroll={false}` so picking a category swaps the pane
without ever moving the page. First shipped as anchor links that scrolled one long page —
revised the same day: jumping the page under the click felt wrong; a rail reads as a
selector, so it should select. Rejected: full sub-pages (1–3 cards each — routing
ceremony for no gain; `?section=` gives the same addressability) and client-side tabs
(state lost on refresh, invisible to the palette). Each category carries a scope tag —
**Account** vs **This device** — since some settings live in Postgres and others in
localStorage, and "will this follow me to my phone?" deserves a structural answer.
Notifications is account-scoped: a rule can create a durable inbox entry, while each
browser/device opts into push independently. The section list lives once in
`src/lib/settings-sections.ts`.

**Subscriptions & data** pairs interoperable OPML with a clear recovery path:
**Download JSON backup** and **Restore a backup**. The download is deliberately complete
for reader-owned data but never contains credentials. Restore uploads a JSON document,
shows a server-validated comparison with the current account, then requires explicit
confirmation before transactionally replacing the account&apos;s reader data. It never has an
ambiguous merge mode, clears this device&apos;s offline cache so queued state cannot return,
and leaves the current account login alone. Server-side scheduled snapshots are informative
rather than configurable in the browser: retention and cadence are deployment concerns, so
the card reports their availability without exposing a filesystem setting in a web form.

## Theming

- Dark mode follows system, manual override (shipped; the Auto/Light/Dark picker lives in Settings); dark surfaces at `#121212–#1E1E1E`, not pure black (halation)
- Light + dark done *well* beats a theme gallery; custom themes are a "later" at most

## Mobile web

Feedbin proves a web reader can be the best phone experience ("the mobile site is so good it turns out to be the best app"). Requirements: comfortable tap targets, pull-to-refresh, mark-read-on-scroll working in the list. The app is installable and supports a device-local offline library; browser push is a separate production rollout because it depends on deployed HTTPS and VAPID configuration.

**Navigation** *(drawer since July 2026)*: below md the feed sidebar is a left-slide **drawer** behind a slim sticky top bar (menu · brand · refresh), so the article list is the primary surface instead of sitting below a full-height feed list. One app-shell layout — fixed viewport height, only the content pane scrolls — and the drawer is the *same* element that's the static sidebar at md+ (`md:static`), so nothing is duplicated. The drawer closes on navigation, Escape, or scrim tap (`src/components/mobile-shell.tsx`). Folder headers can be collapsed and their state persists per user; drag a folder or feed row directly to reorder it within its current list, with mouse, long-press touch, and keyboard sensors plus animated sorting feedback. This organization is stored in the existing user preferences rather than new tables or columns. Empty folders remain visible so a feed can be moved back into them from its menu.

**Swipe gestures** *(shipped July 2026)*: swipe a collapsed row right = toggle read, left
= toggle read-later — matching our triage verbs (a post is either read or kept). iOS-mail
mechanics: the row follows the finger once the drag is clearly horizontal (vertical
always wins — hijacking scroll is the worse failure), an icon zone arms at the trigger
threshold, release fires, row springs back. Collapsed headers only, so expanded articles
keep horizontal code scrolling. Two gestures is the deliberate ceiling — more would need
a legend, and gestures that need a legend have failed.

## Anti-patterns (documented backlash — do not ship)

1. Exact large unread counts (use "1k+" or nothing)
2. AI/enterprise upsells inside the reading flow (Feedly's Trustpilot 2.0/5 is this)
3. Auto-extracted thumbnails from article HTML (NNW's documented failure modes)
4. Density-reducing redesigns — Inoreader's 2024 redesign drew "more scrolling, less content" complaints; scanning density is the product for list views
5. Regex-only filtering (Miniflux's most-cited weakness)
6. Rebinding `/` or other canon keys to new features
7. Removing unread state entirely (Reeder 2024's divisive bet — wrong for our audience)

## Sources

Primary: inessential.com/2018/10/09 (NNW timeline design), terrygodier.com/phantom-obligation + danq.me RSS-Zero (unread anxiety), macstories.net (Reeder 2024), feedbin.com/help + toddjcollins.com/work/feedbin (Feedbin design), miniflux.app/docs, docs.feedly.com, netnewswire.com/help, birchtree.me (scroll-mark dissent), techcrunch.com Feb 2026 (Current), HN reader census Jan 2025 (news.ycombinator.com/item?id=42746682).

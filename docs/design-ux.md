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
- One good default density; compact/comfortable modes can come later
- **Per-feed settings** live on the `subscriptions.settings` column. Shipped so far: full-content default and auto-read-days override. Sort order and density are designed-for but not yet per-feed.

Sorting: newest-first (the shipped default). Oldest-first as a per-feed option (a persistent, vocal minority reads oldest-first "so nothing gets buried") is a later addition.

## Reading (inline-expanded article)

- Article opens in place within a centered max-width column; generous margins. Opening an unread article auto-marks it read
- **System font stack by default** — Feedbin deliberately moved off font-CDNs for privacy; we get the same result for free. Text-size and font choice can come later
- Sanitized article HTML; images constrained to column width; **full-content extraction** via a "Load full content" button in the expanded article, plus a per-feed "always load full content" default that extracts at ingest (the UX consensus across Miniflux `d`, Feedbin `c`, NNW Reader View)
- **Open original** is always one tap away (a link in the expanded article)
- The keyboard equivalents — `space` smart-advance, `v` open original, `c` full-content — are part of the deferred keyboard canon (see below), not yet bound

## Unread & overload management

Philosophy: we're building for "inbox people" (counts, j/k, mark-all-read) but the research on unread anxiety is real — so ship the count, and ship every escape hatch:

- **Cap displayed counts at "1k+"** (shipped) — Feedly's vague number is documented as less stressful than an exact one
- **Mark-all-read** (shipped) with "older than a day/week" variants (Feedly). `o` = mark-older-than-current-article (NNW's catch-up primitive) waits on the keyboard canon
- **Mark-read-on-scroll: on by default, toggle to disable** (shipped). It's praised Inoreader behavior and Tommy's habit — but it has articulate haters (birchtree.me), so it must never be unchangeable
- **Auto-mark-read after N days** (shipped): global default of **30 days** (matching Feedly's silent behavior), overridable per feed. High-volume feeds shouldn't accumulate guilt
- Rules/filters (v1) are the real overload answer — and per the Miniflux complaint ("regex-only"), the rules UI must be **keyword-first with regex as the advanced option**

## Keyboard shortcuts (deferred to "later", July 2026): adopt the canon when built

The Google Reader inheritance is non-negotiable muscle memory for anyone migrating from Feedbin/Inoreader/Feedly/NewsBlur:

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
| `?` | shortcut help overlay |

## Onboarding & empty states

- **OPML import on the first-run screen** — it's the switching lubricant; every product treats it as day-one table stakes
- Add-feed accepts any site URL: autodiscovery via `<link rel="alternate">`, then probe common paths (`/feed`, `/rss.xml`, `/atom.xml`, `/index.xml`), JSON Feed included
- Nobody praises a blank "no feeds yet" screen. Shipped: the empty state pairs OPML import with a small curated starter list of feeds to add in one click

## Theming

- Dark mode follows system, manual override (shipped; the Auto/Light/Dark picker lives in Settings); dark surfaces at `#121212–#1E1E1E`, not pure black (halation)
- Light + dark done *well* beats a theme gallery; custom themes are a "later" at most

## Mobile web

Feedbin proves a web reader can be the best phone experience ("the mobile site is so good it turns out to be the best app"). Requirements: fast stacked navigation, comfortable tap targets, pull-to-refresh, mark-read-on-scroll working in the list. Swipe-row gestures (mark read / star) and PWA installability are "later" polish.

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

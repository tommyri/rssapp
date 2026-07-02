# Design & UX

Decisions for the interface, distilled from a UX survey of the current reader landscape (July 2026). North star: **Feedbin's restraint with Inoreader's power underneath** — the same wedge as the feature plan. Feedbin is the consensus "most beautiful web reader" and the proof that a web app can be the best mobile experience too; we copy its philosophy, not its pixels.

## Layout: three-pane, collapsing to stacked on mobile

Sidebar (feeds/folders) → article list → reading pane. This is the convention every migrating reader user already knows (NetNewsWire established it in 2002, Google Reader cemented it), and the evidence says it's the safe default: even Reeder's radical 2024 redesign kept the three-pane skeleton, and FeedFlow/FreshRSS/NewsBlur all converged on offering it.

- **Mobile:** panes collapse to drill-down navigation (feeds → list → article), each a full screen with back navigation — the universal pattern.
- **Later option, not now:** a single-column "river" reading mode. There's a real 2026 zeitgeist around pressure-free timeline readers (new Reeder, Current, Tapestry), but the HN reader census shows inbox-style users are still the bulk of the audience — and we are one.

## Article list rows

Follow the NetNewsWire timeline recipe (the best-documented design reasoning in the category — inessential.com, 2018):

- Row = feed favicon, **bold title**, lighter 1–2 line snippet, relative time, uniform row height, generous ellipsizing
- **Blue dot for unread** — the de-facto convention (NNW, Reeder, Feedbin); dot beats star when both apply
- **No auto-extracted thumbnails.** NNW documents the failure modes: cropped faces, social-share icons, tracking pixels picked by mistake. If we ever add thumbnails it's per-feed opt-in for image-heavy feeds
- No grid lines; whitespace separation reads more "publication," less "spreadsheet"
- One good default density in MVP; compact/comfortable modes can come later
- **Per-feed view settings** (sort order, full-content default, later density) — every mature product converged on this; our `subscriptions` row already has a settings column for it

Sorting: newest-first default; oldest-first as a per-feed option (a persistent, vocal minority reads oldest-first "so nothing gets buried").

## Reading pane

- Centered single column, ~65–75ch max width, generous margins
- **System font stack by default** — Feedbin deliberately moved off font-CDNs for privacy; we get the same result for free. Text-size control; font choice can come later
- Sanitized article HTML; images constrained to column width; one-key **full-content extraction toggle inside the article view, remembered per feed** (the UX consensus across Miniflux `d`, Feedbin `c`, NNW Reader View)
- `space` = smart advance: scroll the article, then jump to next unread when done (Google Reader inheritance, in every praised reader)
- Open-original always one key (`v`) / one tap away

## Unread & overload management

Philosophy: we're building for "inbox people" (counts, j/k, mark-all-read) but the research on unread anxiety is real — so ship the count, and ship every escape hatch:

- **Cap displayed counts at "1k+"** — Feedly's vague number is documented as less stressful than an exact one
- **Mark-all-read everywhere**, always with "older than a day/week" variants (Feedly), plus `o` = mark-older-than-current-article (NNW's catch-up primitive)
- **Mark-read-on-scroll: on by default, prominent setting to disable.** It's praised Inoreader behavior and Tommy's habit — but it has articulate haters (birchtree.me), so it must never be unchangeable
- **Auto-mark-read after N days** as an optional per-feed/global setting (Feedly does 30 days silently; FreshRSS has per-feed purge). High-volume feeds shouldn't accumulate guilt
- Rules/filters (v1) are the real overload answer — and per the Miniflux complaint ("regex-only"), the rules UI must be **keyword-first with regex as the advanced option**

## Keyboard shortcuts (v1): adopt the canon

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
- Nobody praises a blank "no feeds yet" screen. Cheap fix: a small curated starter list (the `plenaryapp/awesome-rss-feeds` repo is a usable seed catalog). v1, not MVP — Tommy onboards via OPML

## Theming

- Dark mode follows system, manual override; dark surfaces at `#121212–#1E1E1E`, not pure black (halation)
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

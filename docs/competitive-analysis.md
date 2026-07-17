# Competitive Analysis — RSS Readers (July 2026)

Purpose: know what "good" looks like, what people pay for, and where the gap is — both to make our v1 good enough to replace Inoreader, and to position the business option. Decision-oriented; raw research is summarized, sources noted at the end.

## Market map

| Product | Positioning | Price | Lesson for us |
|---|---|---|---|
| **Inoreader** | Power-user hosted reader; automation + monitoring + AI | Free (150 feeds, ads) / Pro $90/yr | The feature benchmark — and "cluttered" is its #1 complaint |
| **Feedly** | Consumer reader hollowed out by an enterprise-intel pivot | Free (weak) / Pro ~$72/yr / Pro+ ~$99/yr | Cautionary tale: paywall creep torched trust (Trustpilot 2.0/5) |
| **Feedbin** | Tasteful minimal indie reader; sync backend for Apple clients | $70/yr, no free tier | Proof that "clean + reliable" alone sells at $70/yr |
| **NewsBlur** | Open-source-hearted reader; per-feed *training* (hide/highlight) | Free (64 sites) / $36/yr / $99/yr archive | The only serious triage story in the market — wrapped in a dated UI |
| **Readwise Reader** | Read-it-later "everything inbox"; RSS rides along | $120/yr, no free tier | Big post-Pocket winner; RSS-as-inbox is not what feed-scanners want |
| **Folo (Follow)** | Open-source AI-native social reader (36k stars) | Free / $50–$1000/yr | Dec 2025 paywall backlash — don't paywall client-side toggles |
| **Miniflux** | Militantly minimal self-hosted Go binary | Free (AGPL); hosted $15/yr | Our closest architectural cousin (Go+Postgres, Readability, GReader API) |
| **FreshRSS** | Featureful, extensible self-hosted PHP; multi-user | Free (AGPL) | Community/extensions moat; mobile story is third-party and thin |
| **NetNewsWire** | Free native Apple client, gold-standard UX | Free | Why the GReader-compat API matters: clients like this need backends |
| **Reeder** | Beautiful Apple client; new version pivoted to iCloud-only $10/yr | $4.99 once (Classic) / $10/yr (new) | Even beloved products lose users over paradigm/pricing shifts |

## The product we're replacing: Inoreader's paywall line

What $90/yr Pro buys over free (i.e., what we must self-provide to actually cancel):

- Feed cap 150 → 2,500 (ours: unlimited, it's our own database)
- **Rules (30) and filters (50)** — auto-tag/mark-read/notify; hide matching articles. The most-cited reason power users pay.
- **Monitoring feeds (30)** — keyword tracking beyond your subscriptions (we likely never build this; it's a media-monitoring product)
- Newsletter-to-feed, saved web pages, social feeds (Bluesky/Telegram/FB)
- AI summaries/Q&A (1M tokens/mo; BYO-API-key since Apr 2026), translations (10/day), TTS (5/day)
- Ad removal, API access, offline folders, duplicate filtering

What paying users actually praise: rules/filters taming high-volume feeds, monitoring, YouTube + newsletter ingestion, cross-platform consistency, **mark-as-read-while-scrolling**. What they complain about: cluttered UI, price hikes, unmanageable unread counts.

## Table stakes (must-match) vs. our plan

| Table-stakes feature | Status |
|---|---|
| OPML import/export | ✅ shipped |
| Folders + unread management | ✅ shipped |
| Mark-read-while-scrolling | ✅ shipped (on by default, toggleable) |
| Full-content extraction for truncated feeds | ✅ shipped |
| Full-text search | ✅ shipped (free at Inoreader; Feedly paywalling it is resented) |
| Dark mode | ✅ shipped (Auto/Light/Dark) |
| Keyboard shortcuts | ⏳ deferred to "later" — nice-to-have for a single user, non-negotiable only if courting migrating power users |
| Mobile: apps, great PWA, or GReader API for third-party clients | ⚠️ responsive web shipped; PWA "later" — acceptable for personal use, gating for business |
| YouTube channels as feeds | ✅ shipped (paste a channel URL → resolves its native RSS) |
| Podcasts as feeds | ✅ audio enclosures play inline; richer podcast management remains later work |
| Newsletter-to-feed | "later" — fine personally; near-expected on paid tiers commercially |
| Longevity signaling | Post-Pocket/Omnivore, "will this exist in 3 years" is an explicit purchase criterion — self-hosting answers it for us personally |

## What people pay for (willingness-to-pay signals)

Consistently paywalled across the market: feed-count caps, **rules/filters/automation**, keyword monitoring, newsletter ingestion, web-page-to-feed, AI summaries/translation, search (Feedly/NewsBlur), API access, fetch frequency, archive depth. If the business happens, this table *is* the free/paid boundary design.

## Where the market is weak (the opportunity list)

1. **Triage is unsolved.** "100k unread, unmanageable" is a recurring complaint; NewsBlur's training is the only real attempt and its UI is dated. AI so far means summaries and upsells, not better triage.
2. **The middle of the UI spectrum is empty.** Inoreader = powerful but cluttered; Miniflux = clean but spartan; Feedly = clean but hollowed-out. *Clean UI with rules/filters underneath* is the repeatedly-implied ask — and exactly our natural position.
3. **Pricing trust is broken at incumbents.** Feedly's Enterprise-gated "Pro+ AI", Inoreader's hikes and quiet removal of the cheap Supporter tier, Folo paywalling client-side toggles. Transparent, stable pricing is now a differentiator by itself.
4. **Android/mobile is chronically underserved** (Feedbin: no Android; FreshRSS: stale third-party clients; best UX is Apple-only). A great PWA + GReader API covers both cheaply.
5. **Cloudflare/bot walls hurt single-IP self-hosted fetchers.** A hosted service's shared fetching infra is a real, defensible advantage — and a known risk for our own home-server fetcher (mitigations: good UA, conditional GET, backoff; accept some feeds may need workarounds).

## Roadmap implications (applied to features.md)

1. **Promote rules/filters from "later" to v1.** It's the #1 willingness-to-pay feature, the thing Inoreader power users actually pay for, and the core of the "clean + powerful" wedge. Even personally, it's how you keep high-volume feeds sane.
2. **Add mark-read-on-scroll to MVP** — table stakes, and specifically praised Inoreader behavior.
3. **Add YouTube-channel add-flow to v1** — paste a channel URL, we resolve the RSS feed. Nearly free, disproportionately appreciated.
4. **Keep monitoring feeds, AI features, newsletters out of v1** — they're what makes Inoreader feel bloated; newsletters and AI summaries are business-tier candidates later (BYO-key AI, per Inoreader's April 2026 move, is the capital-efficient way).
5. **Business framing:** the paywall table above defines a future free/paid split; pricing trust (simple, stable, no bait) is a stated differentiator. Noted in business-option.md.

## Sources & confidence

Primary: inoreader.com/pricing, feedbin.com, newsblur.com, folo.is/pricing, miniflux.app, netnewswire.com, Ask HN Jan 2025 (news.ycombinator.com/item?id=42746682), github.com/RSSNext/Folo/issues/4766, macstories.net (Reeder), techcrunch.com (Pocket shutdown). Caveats: exact Feedly prices unverified (page unreachable; sources disagree ~$6–8/mo); Inoreader free-tier newsletter/web-feed allowances self-contradictory on their own page; several comparison blogs are competitors' SEO content (facts cross-checked where possible).

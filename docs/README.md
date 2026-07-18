# RSS App — Product & Planning Docs

A self-hosted RSS reader web app: subscribe to feeds, get new articles pulled in automatically, and read them in a fast, clean, keyboard-friendly interface.

## Source of truth

- [features.md](features.md) — the living product roadmap: shipped work, the current rollout, and uncommitted release candidates
- [tech-stack.md](tech-stack.md) — chosen technologies with rationale, high-level architecture, and open decisions
- [business-option.md](business-option.md) — decisions made now to keep a future hosted/paid product possible, and what's deliberately deferred
- [competitive-analysis.md](competitive-analysis.md) — the July 2026 reader market: what's table stakes, what people pay for, where the gap is
- [greader-api.md](greader-api.md) — connect a Google Reader-compatible native client with a revocable app password
- [design-ux.md](design-ux.md) — layout, list/reading-pane design, keyboard canon, overload handling, and anti-patterns to avoid
- [deployment.md](deployment.md) — the complete VPS runbook: GitHub Actions, GHCR credentials, protected environment files, staging/production promotion, backups, and calendar-versioned GitHub Releases

## Guiding principles

1. **Reading experience first.** The core loop is: open app → see what's new → read → move on. Everything else serves that.
2. **Own the data.** Subscriptions and articles live in our own database; OPML import/export from day one so there's no lock-in either way.
3. **Boring, durable tech.** Feeds have worked the same way for 20 years. Pick a stack that will still be easy to maintain in five.
4. **Self-hosted first, keep the business option open.** The app already supports multiple accounts, but hosting, billing, scaling, and compliance only arrive when they solve a real product need. See business-option.md.

## Roadmap upkeep

`features.md` is maintained as part of feature delivery, not as an occasional
retrospective:

1. Add a feature to **Next release candidates** only after we have scoped its user
   outcome and major constraints.
2. Move it to **Current rollout** when implementation is complete but needs real-world
   validation or a deployment dependency.
3. Move it to a shipped phase only after that validation succeeds; record important UX
   and architectural choices concisely there or in the more specific design/technical
   document.
4. When a feature changes a product or business assumption, update
   `business-option.md`, `competitive-analysis.md`, or `design-ux.md` in the same
   change so the documents do not contradict the product.

## Release naming

Roadmap phases explain the product outcome; shipped builds use calendar versions in the
form `YYYY.M.N` (for example `2026.7.1`). The package version, Git tag
`vYYYY.M.N`, GHCR image tag, changelog heading, and GitHub Release all use the same
calendar version. See [deployment.md](deployment.md) for the release sequence.

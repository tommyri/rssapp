# Currentfold — Product & Planning Docs

A focused reader for following, saving, and returning to the open web, with a
self-hostable web application and a native-client foundation.

## Source of truth

- [features.md](features.md) — the living product roadmap: shipped work, the current rollout, and uncommitted release candidates
- [tech-stack.md](tech-stack.md) — chosen technologies with rationale, high-level architecture, and open decisions
- [business-option.md](business-option.md) — decisions made now to keep a future hosted/paid product possible, and what's deliberately deferred
- [competitive-analysis.md](competitive-analysis.md) — the July 2026 reader market: what's table stakes, what people pay for, where the gap is
- [greader-api.md](greader-api.md) — connect a Google Reader-compatible native client with a revocable app password
- [design-ux.md](design-ux.md) — layout, list/reading-pane design, keyboard canon, overload handling, and anti-patterns to avoid
- [brand-identity.md](brand-identity.md) — the approved Currentfold identity: positioning, name, logo assets, responsive use, typography, colour, voice, and production checks
- [ADR 0001](adr/0001-product-monorepo-and-native-api.md) — why the web app, native iOS client, brand system, and API contract live in one product monorepo
- [ADR 0002](adr/0002-native-account-authentication.md) — why native account flows use short-lived access tokens and rotating, revocable device sessions
- [first-party-api.md](first-party-api.md) — the versioned Currentfold-owned client API, contract rules, initial routes, and authentication boundary
- [iOS README](../apps/ios/README.md) — generate, build, lint, and test the native SwiftUI application
- [sign-in-with-apple.md](sign-in-with-apple.md) — deferred production-readiness checklist covering Apple membership, signing, credential revocation, private email relay, deployment, and validation
- [deployment.md](deployment.md) — the complete VPS runbook: GitHub Actions, GHCR credentials, protected environment files, staging/production promotion, backups, and calendar-versioned GitHub Releases
- [brand-domain-migration.md](brand-domain-migration.md) — the planned full-stack rebrand and clean single-user cutover: product identity, repository/image, database/storage, domain, Resend, and Cloudflare
- [full-content-by-default.md](full-content-by-default.md) — the shipped design and operating model for reliable, queued full-text extraction on every linked feed item
- [durable-saved-copies.md](durable-saved-copies.md) — parked analysis for private, durable article copies, preserved assets, and portable exports that survive link rot

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

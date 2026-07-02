# RSS App — Planning Docs

A self-hosted RSS reader web app: subscribe to feeds, get new articles pulled in automatically, and read them in a fast, clean, keyboard-friendly interface.

## Documents

- [features.md](features.md) — what we're building, phased into MVP → v1 → later ideas
- [tech-stack.md](tech-stack.md) — chosen technologies with rationale, high-level architecture, and open decisions
- [business-option.md](business-option.md) — decisions made now to keep a future hosted/paid product possible, and what's deliberately deferred
- [competitive-analysis.md](competitive-analysis.md) — the July 2026 reader market: what's table stakes, what people pay for, where the gap is
- [design-ux.md](design-ux.md) — layout, list/reading-pane design, keyboard canon, overload handling, and anti-patterns to avoid

## Guiding principles

1. **Reading experience first.** The core loop is: open app → see what's new → read → move on. Everything else serves that.
2. **Own the data.** Subscriptions and articles live in our own database; OPML import/export from day one so there's no lock-in either way.
3. **Boring, durable tech.** Feeds have worked the same way for 20 years. Pick a stack that will still be easy to maintain in five.
4. **Start single-user, keep the business option open.** Personal app first, but a hosted multi-user product is a plausible future — so schema and app code are multi-tenant from day one, while business machinery (billing, scaling, compliance) waits until it's real. See business-option.md.

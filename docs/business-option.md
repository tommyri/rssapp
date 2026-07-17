# Keeping the Business Option Open

Position: build v1 as a simple personal product, but treat "hosted service with paying users" as a plausible future. The filter for every early decision is: **make it now only if it's cheap today and expensive to retrofit.** Everything else waits until the business is real. In July 2026 that threshold was crossed for account lifecycle: a product cannot safely add strangers without verified identity, recovery, and revocation. Public registration and guided first-run setup now sit on those foundations.

## Decisions locked in now (cheap today, painful to retrofit)

1. **Multi-tenant data model.** Global `feeds`/`items` shared across users, per-user `subscriptions`/`item_states` (already in tech-stack.md). One fetch serves every subscriber of a feed — this is literally the unit economics of a hosted reader. Retrofitting tenancy into a single-user schema is a rewrite; having it now costs one extra join.

2. **All application code is user-scoped from day one.** Every query filters by the session's `user_id`, even while exactly one user exists. No `WHERE user_id = 1` shortcuts, no global "the user" singleton, no settings stored app-wide that are really per-user. This discipline is the highest-leverage item on this list: it turns "add multi-user" into *enable registration*, instead of an audit of every query in the codebase.

3. **The fetcher stays behind a module boundary.** The worker communicates with the rest of the app only through its own interface and the database — it never imports web-layer code. If a hosted service needs the fetcher split into its own container (or several), that's a deployment change, not a refactor.

4. **Email is the login identity.** Auth.js credentials with email + password, not a username. Email is what password reset, notifications, and billing all need later.

5. **Account lifecycle is server-enforced.** Users have an active/suspended state and a
   session version. Every protected request rechecks both against Postgres; password
   resets revoke existing JWTs. A single deployment owner can review member accounts and
   suspend or restore them; either transition revokes that member's existing JWTs.
   The first signup owns a fresh deployment; a multi-account upgrade uses an explicit
   operator-transfer command rather than guessing from account age.
   One-time verification/reset/change-email links and owner-issued invitations are stored
   only as hashes, with bounded expiry, and delivered through transactional email. Failed
   sign-ins and anonymous signup/recovery requests have durable, salted-hash rate limits
   before public registration is exposed.

5. **Bigint primary keys, not UUIDs.** The Google Reader–compat API — the feature with the most direct business leverage — expects int64 item ids. Bigint ids now make it a pure API layer later; UUIDs would force an id-mapping retrofit across millions of item rows.

6. **Stay closed-source until we choose a license deliberately.** If we open the code, the license *is* a business decision: MIT/Apache lets anyone run a competing hosted service on our code; AGPL protects a hosted offering (the Miniflux/FreshRSS route). No action needed now — just don't publish the repo casually before deciding.

## Deliberately deferred (cheap to add later, dead weight to carry now)

- **Billing** — Stripe, plans, entitlements. A `plan` column and a webhook handler bolt onto the existing `users` table when there's revenue to collect.
- **Scaling machinery** — job queues (BullMQ/Redis), read replicas, caching layers. The `next_fetch_at` + `fetch_log` design upgrades to a real queue naturally.
- **Teams/orgs, sharing, SSO** — org-shaped features for an org-shaped business we don't have.
- **Staff roles and support impersonation** — the one-owner console is enough for a
  self-hosted deployment. Multiple operators, audit trails, and any support-session
  feature need a separate security design before we host accounts ourselves.
- **Compliance (GDPR export/delete)** — OPML export already covers the biggest piece; full account export/delete is a v-whenever-there-are-users feature. Keep in mind, don't build.
- **Observability stack** — structured logs now; metrics/tracing when there's traffic worth measuring.

## Market context (orientation, not commitment)

A useful anchor: the builder is the archetype customer — a paying Inoreader user who'd rather own the tool than rent it. "Everything I actually use from Inoreader, without the subscription or the clutter" is both the v1 acceptance test and the sharpest one-line pitch we have so far. See competitive-analysis.md for the feature landscape this is based on.


Reference points if this ever becomes a product: Feedbin (~$5/mo hosted reader), Inoreader and Feedly (freemium SaaS), Miniflux and FreshRSS (open-source self-hosted, donations/hosting). Two plausible angles for us:

- **Hosted reader subscription** — the classic Feedbin model; our fetch-once-serve-many architecture is built for it.
- **Sync backend for native clients** — the Google Reader–compat API in features.md "later" is the one feature with direct business leverage: NetNewsWire/Reeder users need *something* to sync against, and that something can charge a few dollars a month.

Two findings from competitive-analysis.md sharpen this:

- **The free/paid boundary is already market-designed.** What every incumbent paywalls — feed caps, rules/filters, newsletter ingestion, monitoring, AI summaries, API access — is a ready-made template for a future pricing page. No need to invent it.
- **Pricing trust is a differentiator now.** Feedly (Trustpilot 2.0/5 after Pro+ users found its AI Enterprise-gated), Inoreader (hikes, quietly killed its cheap tier), and Folo (paywalled client-side toggles, community exodus) have all burned users. Simple, stable, honestly-scoped pricing — and never paywalling things that cost us nothing — is a stated principle if we ever charge.

## Open questions (decide when the option starts looking real)

1. Open-source or not — and if so, MIT-style goodwill vs. AGPL protection.
2. Which angle: hosted reader UI, sync backend, or both.
3. Whether the Reader-compat API should move up the roadmap on business grounds alone.
4. **Multilingual search at scale.** Today search indexes with English + Norwegian
   stemmers (the builder's actual mix — one migration to change, not a lock-in).
   Customers in arbitrary languages need a real strategy: per-feed language detection
   with per-language configs, language-neutral `simple` + trigram matching, or an
   external engine (Meilisearch/Typesense). Decide when there are non-EN/NO users;
   the generated-column design makes any of these a contained migration.

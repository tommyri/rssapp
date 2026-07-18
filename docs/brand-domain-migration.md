# Brand, domain, email, and Cloudflare migration plan

**Status:** planning — do not begin the cutover until the decisions in
[Decision gate](#decision-gate) are complete.

## Outcome

Move rssapp from the personal `rssapp.badask.no` deployment to a durable product identity:

- a new public product name and visual identity;
- a dedicated, owned brand domain for the reader;
- transactional email from a verified sender domain that is not tied to a personal zone;
- Cloudflare in front of the public web origin for authoritative DNS, TLS, and measured
  edge protection; and
- a controlled origin migration that keeps the database and application deployment
  reproducible.

This is a **single production cutover plan**, not a staging prerequisite. Staging remains
useful later, but the work below should not be blocked on it.

## Guiding decisions

1. **Product identity and operational identity are separate.** The public name, app
   metadata, email copy, and user-facing files change. The GitHub repository, GHCR image,
   Compose project, Postgres volume, backup schema, API token prefix, and service-worker
   storage remain `rssapp` for this migration. Renaming them creates unnecessary data,
   cache, and rollback risk.
2. **Use one dedicated brand zone.** Prefer `<brand-domain>` as the app's canonical domain
   and `send.<brand-domain>` as the Resend-verified sending subdomain. This separates mail
   DNS from the personal `badask.no` zone without making the sender look unrelated to the
   product.
3. **Cloudflare is the edge, not the application runtime.** The existing VPS, Caddy/Nginx
   reverse proxy, Docker Compose, Postgres, and GHCR deployment model remain. Adopt
   Cloudflare DNS and proxy first; defer Workers, Tunnel, R2, and email-routing products
   until they solve a concrete need.
   Moving the domain's registrar is a separate administrative decision, not a cutover
   prerequisite: the new brand zone can use Cloudflare authoritative DNS without changing
   where it is registered.
4. **Preserve the old domain temporarily.** Keep `rssapp.badask.no` serving a path and
   query preserving redirect to the new origin for at least 90 days. This keeps old links
   and bookmarks useful while people update native-client server addresses.
5. **Make the browser-origin change explicit.** Cookies, installed PWA state, offline
   data, and push subscriptions are origin-bound. Readers will sign in again, reinstall
   the PWA if desired, and re-enable push on the new domain. This is expected, not a data
   loss event.

## Target topology

| Concern | Target | Notes |
|---|---|---|
| Canonical reader | `https://<brand-domain>` | Set as `APP_URL`; HTTPS only. |
| Legacy reader | `https://rssapp.badask.no` | Full-path/query redirect to canonical domain; retain during transition. |
| Transactional sender | `accounts@send.<brand-domain>` | Example display: `<Brand> <accounts@send.<brand-domain>>`. |
| Outbound email | Resend | Verify the `send.<brand-domain>` DNS records before cutover. |
| Authoritative DNS / edge | Cloudflare | Proxied web record; DNS-only mail and verification records. |
| Origin | Existing VPS + Caddy/Nginx + Docker Compose | App remains loopback-bound; Postgres remains unpublished. |
| Production image | `ghcr.io/tommyri/rssapp:sha-<tested-commit>` | Retain current immutable SHA as rollback point. |

### Cloudflare record policy

- The reader's A/AAAA/CNAME record is **proxied** (orange cloud).
- MX, SPF, DKIM, DMARC, Resend verification records, and any mail-service hostname are
  **DNS-only**. Cloudflare's HTTP proxy does not carry SMTP/IMAP/POP3 and must not sit in
  front of mail or third-party domain-verification targets.
- Use Full (strict) TLS between Cloudflare and the VPS. Keep the existing origin TLS
  termination in Caddy/Nginx; do not introduce a second application proxy or a Worker in
  this migration.
- Do not add a "cache everything" rule. Authenticated HTML and `/api/*` remain dynamic;
  Cloudflare may cache normal static assets under the framework's headers.

## What changes in the application

### Public branding — change in the brand release

The code audit already identifies these user-visible surfaces:

- root metadata and browser title;
- PWA manifest name, short name, description, and branded icon;
- reader, mobile, login, signup, and onboarding wordmarks;
- account, OAuth, verification, and recovery messages;
- transactional email subject lines and body copy;
- push-notification titles and copy;
- bookmarklet label, OPML export title/filename, backup filename, application-user-agent,
  and setup/help text;
- new native-reader app-password display prefix and protocol-facing product labels;
- README, product/roadmap docs, and Google Reader API help.

The brand release also needs a small visual package: wordmark rules, an SVG/icon source,
favicon/maskable PWA icon, favicon colors, and a concise product description. Record the
source and licence of any visual asset so the product identity is durable and reviewable.

### Internal identifiers — preserve for compatibility

Do **not** rename these in the same migration:

- `rssapp` GitHub repository, GHCR image name, Docker Compose project, systemd unit,
  VPS configuration directory, database name/user/volume, or backup directory;
- backup document format (`rssapp-backup`) and previously exported backup compatibility;
- service-worker cache names, IndexedDB names, local-storage keys, background-sync tags,
  scheduler globals, or legacy Reader API app-password prefix validation;
- package name and existing release-tag history.

They are not reader-facing brand commitments, and keeping them makes old backups, old
PWA state, deployment scripts, and rollback behavior safe. A future repository/registry
rename can be a separate migration with its own compatibility plan.

New app passwords may adopt a branded prefix, but authentication must accept the existing
`rssapp_api_` prefix until every old password is revoked or has expired. Likewise, backup
downloads may receive a branded filename while their `rssapp-backup` document format
remains unchanged and restores continue to accept prior exports.

## Origin and integration migration matrix

| Surface | Required action | Expected reader effect |
|---|---|---|
| `APP_URL` | Set to `https://<brand-domain>` before the brand image deploys. | New account-email links point at the new origin. |
| Reverse proxy | Add canonical host; keep legacy host redirecting paths and query strings. | Existing links continue to work during the transition. |
| Session cookies | No unsafe cross-domain cookie migration. | Everyone signs in again at the new host. |
| Google OAuth | Add `https://<brand-domain>/api/auth/callback/google` to the production OAuth client before cutover. | Google sign-in continues after a new authorization round. An in-flight sign-in begun on the old origin is restarted at the new origin. |
| Resend | Verify `send.<brand-domain>` and set `EMAIL_FROM` to a valid sender at that exact domain. | New verification/reset/invitation emails carry the brand sender. |
| Browser push | Generate a fresh VAPID key pair for the new domain, update the three VAPID variables, and ask readers to opt in again. | Existing subscriptions cannot transfer across origins. |
| PWA/offline library | Publish the rebranded manifest/icon on the new host. | Install and offline data are new per-origin; source articles remain in the server database. |
| Native reader apps | Announce the new Google Reader-compatible server URL. Keep the old host redirecting only if the client is confirmed to follow redirects; otherwise readers update it manually. | App passwords and server data remain valid. |
| Account email links | Keep old host redirecting query strings for 90+ days. | Outstanding verification/reset links remain usable. |
| Cloudflare visitor IP | Configure the host proxy to accept original visitor IPs only from Cloudflare and to pass a trustworthy `X-Forwarded-For`/real-IP value to the app. | Signup/sign-in rate limits continue to distinguish real visitors. |

## Phased plan

### Phase 0 — Decide and prepare

**Exit criteria:** every item in the Decision gate is settled; no public DNS or app setting
has changed.

1. Choose the product name, primary domain, and `send.` subdomain.
2. Do a basic availability and trademark/confusion check before buying or announcing the
   name.
3. Decide whether the canonical app is the apex domain or `reader.<brand-domain>`.
4. Record the current production image SHA, `APP_URL`, proxy configuration, Google OAuth
   client, Resend domain, VAPID keys, and working health check as rollback references.
5. Prepare the brand language and visual assets before changing code.

### Phase 1 — Build the brand release

**Exit criteria:** all public product strings and assets are rebranded; no data migration
or domain cutover has happened.

1. Replace public display-name surfaces from the audit above; retain internal identifiers.
2. Issue new native-reader passwords with the branded prefix while accepting both old and
   new prefixes; keep the backup document format and old restore support unchanged.
3. Harden the network rate-limit helper before enabling the Cloudflare proxy: test that a
   proxy-owned real-IP header takes precedence, retain a development fallback, and make
   the production proxy overwrite—not forward—untrusted client headers.
4. Add or update tests for manifest/metadata/email copy, app-password compatibility, and
   rate-limit header precedence where they encode the chosen product name or proxy trust.
5. Review PWA installation, mobile navigation, all account email templates, push copy,
   OPML, backups, and the native-client setup guide.
6. Add a concise `Brand & domain migration` release note and document the expected
   sign-in/PWA/push transition.
7. Build, lint, test, and publish an immutable image as usual. Do not deploy it yet.

### Phase 2 — Establish the new DNS and mail domain

**Exit criteria:** the new domain works at the origin, Resend marks the sender domain
verified, and no production `APP_URL` has changed.

1. Add `<brand-domain>` to Cloudflare and change its registrar nameservers only after
   exporting the existing DNS plan for reference.
2. Create the VPS web-origin record as proxied. Configure Caddy/Nginx with a new host
   block and valid origin TLS.
3. Add the Resend-supplied records for `send.<brand-domain>` exactly as provided; leave
   them DNS-only. Add SPF/DKIM and a deliberate DMARC policy.
4. Create a production Resend sending-only API key scoped to the verified sending domain;
   store it only in `/etc/rssapp/production.env`.
5. Add the new canonical callback to the existing production Google OAuth client. Use a
   separate client only when Google project ownership or consent branding needs to change;
   the credentials remain server-only in either case.
6. Configure the Cloudflare controls available on the selected plan: no inappropriate
   cache rule, documented baseline security settings, and a narrow emergency mitigation
   for abusive signup traffic. Turnstile is a later product decision, not a prerequisite
   for this cutover.
7. Verify real-client-IP handling at the Caddy/Nginx → app boundary before relying on
   Cloudflare's proxy. The proxy must accept a Cloudflare visitor-IP header only from
   Cloudflare address ranges, overwrite untrusted forwarding headers with a verified
   real-IP value, and pass that value to the application. Do not rely on the current
   header order without this review.

### Phase 3 — Cut over production

**Exit criteria:** the canonical new domain is healthy; account email and Google sign-in
work; the old domain safely redirects; monitoring shows no unexpected errors.

1. Put the branded image's immutable SHA, new `APP_URL`, new `EMAIL_FROM`, Resend key,
   Google credentials/callback, and fresh VAPID values in `/etc/rssapp/production.env`.
2. Deploy with `scripts/deploy-image.sh production`; it creates a pre-deploy database
   backup and waits for health.
3. Validate, in order:
   - `https://<brand-domain>/api/health`;
   - password sign-up, verification email, verification link, and sign-in;
   - password reset and invitation email;
   - Google sign-in/linking;
   - browser install, offline reading, push opt-in/delivery, and notification click;
   - native-reader API authentication at the new URL;
   - an unauthenticated visitor and two distinct visitor IPs through Cloudflare.
4. Enable the old-domain full-path/query redirect only after the new domain checks pass.
5. Announce the migration to existing readers through an in-app notification or a concise
   account email, with the new URL and the expected PWA/push re-enrollment step.

### Phase 4 — Observe, then retire legacy access

**Exit criteria:** the legacy retention period has passed and all integrations use the new
host.

1. Watch origin logs, Cloudflare events, Resend delivery/rejection logs, sign-up error
rates, and health checks for at least seven days.
2. Keep the legacy redirect for at least 90 days. An old Google sign-in started before
   cutover is deliberately restarted at the new origin rather than maintaining a fragile
   cross-origin authentication callback.
3. Remove the old DNS/proxy/OAuth callback only after native clients, old email links,
   and reader communications no longer depend on it.
4. Update the operational runbook with the final names, domains, sender, OAuth client,
   VAPID key rotation date, and Cloudflare configuration summary.

## Cutover rollback

The database schema and content do not change during this migration. If the new origin
fails, restore the previous immutable app image and previous environment values
(`APP_URL`, sender, OAuth, VAPID) and keep the old host serving. Do not restore the
database merely to roll back branding or DNS.

Keep both host configurations active until the new origin is proven. The main irreversible
reader effects are new-origin cookies/PWA/push state, which are safe to recreate and do
not affect the server-side reader data.

## Decision gate

These choices must be made before Phase 1 implementation begins:

| Decision | Current recommendation | Owner decision |
|---|---|---|
| Product name | A distinctive, pronounceable name with an available domain | Pending |
| Canonical domain | `<brand-domain>` unless a product reason favors `reader.<brand-domain>` | Pending |
| Sender | `accounts@send.<brand-domain>` | Pending |
| Legacy-domain period | Minimum 90-day full-path/query redirect | Pending |
| Cloudflare scope | DNS + proxied web host + TLS/WAF baseline; no Workers/Tunnel yet | Pending |
| Public signup posture | Keep current policy; add Turnstile only when abuse/traffic justifies it | Pending |
| Staging | Defer until the identity cutover is stable | Confirmed deferred |

## Runbook handoff

Once the name, domains, and Cloudflare choices are decided, convert this plan into an
operator runbook with exact record values, Caddy/Nginx host blocks, environment files,
Cloudflare settings, validation commands, an accountable cutover checklist, and the
rollback commands. Do not use placeholder values in the final runbook.

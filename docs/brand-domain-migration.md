# Full product rebrand and clean deployment plan

**Status:** planning — do not begin implementation or cutover until the pending choices
in [Decision gate](#decision-gate) are complete.

## Outcome

Replace RSS App with the Currentfold product identity across the entire active stack:

- the approved Currentfold name and visual identity;
- a dedicated brand domain for the reader;
- transactional email from a verified sender under that domain;
- Cloudflare in front of the existing VPS for authoritative DNS, TLS, and measured edge
  protection;
- newly branded repository, package, image, deployment, database, storage, backup, and
  protocol identifiers; and
- a clean production deployment with no legacy-domain redirect or permanent
  compatibility layer.

There are no external users to migrate. The owner is currently the only reader, so this
is the right time to remove the temporary `rssapp` identity completely instead of
carrying it into the product architecture.

This is a single production cutover, not a staging prerequisite. Staging remains useful
later but is deliberately deferred.

## Confirmed migration decisions

1. **Rebrand the whole active stack.** Public strings and internal operational
   identifiers both adopt the new product name. This includes the GitHub repository,
   package, GHCR image, Compose project, database and role, Docker volume, filesystem
   paths, backup format and filenames, app-password prefix, PWA storage, and service
   identifiers.
2. **Use a clean deployment boundary.** Create newly named infrastructure instead of
   trying to rename Docker volumes or a running Postgres service in place. If the owner
   wants to retain current reading data, move it once with a database dump and restore
   into the newly named database. This does not require permanent legacy code.
3. **Do not redirect the old domain.** After the new origin is validated,
   `rssapp.badask.no` can be removed. Old bookmarks, sessions, email links, PWA state,
   push subscriptions, and native-client configuration do not need compatibility.
4. **Use one dedicated brand zone.** Prefer `<brand-domain>` as the canonical reader and
   `send.<brand-domain>` as the Resend-verified sending subdomain.
5. **Cloudflare is the edge, not the runtime.** Keep the VPS, Caddy/Nginx, Docker
   Compose, Postgres, and image deployment model. Begin with Cloudflare DNS, proxy, TLS,
   and a conservative security baseline; add Workers, Tunnel, R2, or email routing only
   when they solve a concrete need.
6. **Treat the browser origin as new.** Sign in again, reinstall the PWA if desired,
   recreate offline browser data, enable push again, and reconnect native clients. The
   reset is acceptable because there are no external users.

Historical Git commits, existing release tags, and old backups remain historical
evidence; do not rewrite Git history to erase the old name. They may be deleted after
the rollback window where appropriate, but they are not active compatibility contracts.

## Data transition

The cutover supports two deliberate choices.

### Fresh start

Create an empty newly named database, run migrations, create the owner account, and
re-import subscriptions through OPML. This is the cleanest option if reading state,
saved pages, highlights, rules, and notification history are disposable.

### One-time database transfer

Stop writes briefly, take a final PostgreSQL dump, restore it into a newly named
database owned by a newly named role and volume, run migrations, and validate important
row counts. This preserves all existing data without retaining old database, Compose,
backup-format, or application identifiers.

The old database volume and final dump should remain read-only during a short rollback
window, then be removed after the new deployment is proven. Application-level JSON
backup compatibility is not the preferred migration mechanism because the new product
can adopt a new backup format without carrying an old-format parser indefinitely.

## Target topology

| Concern | Target | Notes |
| --- | --- | --- |
| Canonical reader | `https://<brand-domain>` | Set as `APP_URL`; HTTPS only. |
| Old reader | Removed after validation | No redirect or compatibility host. |
| Transactional sender | `accounts@send.<brand-domain>` | Example: `<Brand> <accounts@send.<brand-domain>>`. |
| Outbound email | Resend | Verify the new sending subdomain before cutover. |
| DNS and edge | Cloudflare | Proxied web record; DNS-only mail and verification records. |
| Origin | Existing VPS + Caddy/Nginx + Docker Compose | Application remains loopback-bound; Postgres remains unpublished. |
| Source repository | `<owner>/<brand-slug>` | Rename the active GitHub repository and local remote. |
| Production image | `ghcr.io/<owner>/<brand-slug>:sha-<tested-commit>` | New package; immutable SHA remains the deployment unit. |
| Compose project | `<brand-slug>` | Produces newly named containers, networks, and volumes. |
| Database | `<brand-db>` owned by `<brand-role>` | New credentials and a new named volume. |
| VPS configuration | `/opt/<brand-slug>`, `/etc/<brand-slug>`, `/var/backups/<brand-slug>` | Replace current active paths and scripts. |

The domain may use Cloudflare authoritative DNS without moving its registrar. Registrar
transfer is a separate administrative choice.

### Cloudflare record policy

- Proxy the reader's A/AAAA/CNAME record.
- Keep MX, SPF, DKIM, DMARC, Resend verification, and mail-service records DNS-only.
- Use Full (strict) TLS between Cloudflare and the VPS.
- Keep existing origin TLS termination in Caddy/Nginx.
- Do not add a cache-everything rule: authenticated HTML and `/api/*` remain dynamic.
- Configure the reverse proxy to trust Cloudflare visitor-IP headers only from
  Cloudflare ranges and to overwrite untrusted forwarding headers before requests reach
  application rate limiting.

## Full rename inventory

### Product surfaces

- root metadata, page titles, descriptions, and structured metadata;
- PWA manifest, install name, icons, favicon, maskable icon, and theme colors;
- reader, mobile, authentication, onboarding, settings, and account-administration UI;
- verification, recovery, invitation, notification, digest, and push copy;
- bookmarklet label, OPML title and filename, backup filename, user agent, and help text;
- native-reader setup instructions and protocol-facing labels;
- README, product documentation, release notes, and deployment documentation.

The reviewable visual package is defined in [brand-identity.md](brand-identity.md):
wordmark rules, source SVG, favicon and maskable PWA sources, colour tokens, typography,
positioning, voice, and licence/source records. Raster exports and in-product replacement
belong to Phase 1.

### Internal and operational surfaces

- `package.json` package identity and default application metadata;
- GitHub repository and Actions references;
- GHCR package path and OCI image labels;
- Dockerfile labels, Compose project/service/container/network/volume names;
- database name, role, password variables, connection examples, and backup commands;
- VPS application, environment, backup, and systemd/timer paths;
- deployment and restore scripts, health-check examples, and runbooks;
- backup document marker and generated filenames;
- new native-reader app-password prefix and validation;
- service-worker cache names, IndexedDB databases, local-storage keys, sync tags, and
  scheduler globals where they contain the old identity;
- application user agent, telemetry/health labels, and operational log names.

Because this is a clean origin and stack, the new application does not need to accept
old app passwords, old backup documents, old browser storage, or old service-worker
caches. Existing source data, if retained, moves through the one-time database transfer.

## Integration reset matrix

| Surface | Required action | Expected effect |
| --- | --- | --- |
| `APP_URL` | Set to `https://<brand-domain>`. | All newly generated links use the product domain. |
| Reverse proxy | Add only the new canonical host for the new deployment. | The old host is removed after validation. |
| Sessions | Generate/use the new deployment secret and sign in again. | Existing sessions end. |
| Google OAuth | Update consent branding and add `https://<brand-domain>/api/auth/callback/google`. | Google sign-in starts fresh on the new origin. |
| Resend | Verify `send.<brand-domain>` and set a sender at that exact domain. | New email carries only the new identity. |
| Browser push | Generate a fresh VAPID pair and opt in again. | Old subscriptions are abandoned. |
| PWA/offline data | Publish new manifest, assets, and storage identifiers. | Install and offline data start clean. |
| Native reader apps | Use the new server URL and create a newly prefixed app password. | Old endpoint and password are not supported. |
| Backups | Write a newly branded format and path. | Old exports are historical, not ongoing restore contracts. |

## Phased plan

### Phase 0 — Decide and inventory

**Exit criteria:** the decision gate is complete and exact old/new identifiers are
recorded; nothing public has changed.

1. Choose the product name, slug, primary domain, canonical hostname, and sender.
2. Perform availability, trademark, and product-confusion checks before purchase or
   announcement.
3. Choose fresh start or one-time database transfer.
4. Record every active `rssapp` identifier in code, GitHub, GHCR, Compose, Postgres,
   systemd, VPS paths, DNS, Google, Resend, VAPID, backups, and browser storage.
5. Record the current image SHA, database backup, environment, proxy configuration, and
   health checks as rollback evidence.
6. Complete the positioning and visual package.

### Phase 1 — Build the fully branded release

**Exit criteria:** source, tests, documentation, automation, artifacts, and runtime
defaults use the new identity; production has not changed.

1. Replace all public product strings and assets.
2. Rename active internal identifiers from the inventory, including backup format,
   app-password prefix, browser storage, deployment examples, and package metadata.
3. Rename the GitHub repository or create the final branded repository, update the local
   remote, and publish to the newly named GHCR package.
4. Update workflows, Compose, scripts, environment templates, database commands,
   systemd examples, backup/restore commands, and documentation.
5. Harden and test trusted visitor-IP handling before placing Cloudflare in front.
6. Update tests that encode metadata, manifest, email/push copy, protocol labels,
   backup format, and operational identifiers.
7. Run lint, tests, build, and container checks; publish an immutable candidate image.
   Do not deploy it yet.

### Phase 2 — Prepare domain, providers, and clean infrastructure

**Exit criteria:** the new domain reaches a prepared origin, email is verified, provider
integrations are configured, and the new stack can start without touching production.

1. Add the brand domain to Cloudflare and configure the proxied reader record.
2. Configure Caddy/Nginx for the new host with valid Full (strict) origin TLS.
3. Verify `send.<brand-domain>` in Resend with DNS-only SPF, DKIM, and deliberate DMARC
   records; create a production sending key scoped as narrowly as possible.
4. Update Google OAuth branding and callbacks.
5. Generate new VAPID and application/session secrets.
6. Create newly branded VPS directories, protected environment files, Compose project,
   database role/name, volume, backup directory, and deployment service/timer names.
7. Verify real-client-IP behavior through Cloudflare before relying on application rate
   limits.

### Phase 3 — Cut over production

**Exit criteria:** the new product origin and stack are healthy; the chosen data policy
is complete; the old domain is no longer serving the app.

1. Stop writes to the old application and take a final compressed database dump.
2. For a fresh start, migrate the empty new database and create the owner. For data
   transfer, restore the final dump into the new database, run migrations, and validate
   counts for accounts, subscriptions, items, saved pages, highlights, rules, and
   notification settings.
3. Deploy the tested branded image by immutable SHA with the new environment.
4. Validate health, password and Google sign-in, verification/reset/invitation email,
   feed refresh, full-content extraction, digests, push, PWA install/offline reading,
   backup/restore, and native-reader authentication.
5. Confirm Cloudflare visitor IPs and rate limiting with distinct clients.
6. Remove the old `rssapp.badask.no` DNS/proxy host. Do not add a redirect.

### Phase 4 — Observe and remove the old stack

**Exit criteria:** the rollback window has passed and no active infrastructure uses the
old identity.

1. Monitor application/origin logs, Cloudflare events, Resend delivery, scheduler jobs,
   backups, authentication errors, and health checks for at least seven days.
2. Keep the final old database dump and stopped old volume read-only for the agreed
   rollback window; do not keep the old application publicly reachable.
3. After validation, remove the old Compose project, volumes, database role/name,
   environment and backup paths, obsolete GHCR packages, provider records/keys, and VPS
   service definitions.
4. Update the operational runbook with the final names, domains, records, paths,
   credentials ownership, validation results, and key-rotation dates.

## Rollback

The clean deployment makes rollback explicit rather than mixing old and new identities.
Until the rollback window ends, retain:

- the previous immutable image SHA;
- the stopped old Compose project and database volume;
- the final compressed database dump;
- the previous protected environment and proxy configuration.

If a critical failure appears, stop the new stack and temporarily restore the old stack
and old hostname. This is emergency rollback, not a compatibility redirect. Do not copy
partially written data between stacks without a separate recovery decision.

## Decision gate

### Preliminary Currentfold check — 2026-07-22

An exact-name web search found no meaningful software, reading-product, or company
collision for **Currentfold**. RDAP returned `404` (no registered domain object) for
`currentfold.com`, `currentfold.app`, `currentfold.io`, and `currentfold.no` at the time
of checking. That is encouraging but transient: availability must be reconfirmed at the
chosen registrar immediately before purchase. This is a preliminary product-confusion
check, not legal trademark clearance.

| Decision | Current recommendation | Status |
| --- | --- | --- |
| Rebrand scope | Rename all active public and internal identifiers | **Confirmed** |
| Old domain | Remove after successful validation; no redirect | **Confirmed** |
| Staging | Defer until after the identity cutover | **Confirmed** |
| Product name and slug | **Currentfold** / `currentfold`; complete external availability and legal checks before purchase or announcement | Direction confirmed; check pending |
| Visual identity | Folded-current C, Newsreader wordmark, paper/ink/coral system | **Confirmed and documented** |
| Canonical domain | Brand apex unless a product reason favors `reader.<brand-domain>` | Pending |
| Sender | `accounts@send.<brand-domain>` | Pending on name/domain |
| Data transition | One-time PostgreSQL transfer if personal state matters; otherwise fresh start | Pending |
| Rollback retention | Keep stopped old stack and final dump for 14 days | Pending |
| Cloudflare scope | DNS + proxy + strict TLS + conservative WAF baseline | Pending confirmation |
| Public signup | Keep controlled during early product validation | Pending |

## Runbook handoff

Once the name, domain, data-transition choice, and Cloudflare scope are settled, convert
this plan into an operator runbook with exact repository/image names, DNS records,
Caddy/Nginx blocks, Compose identifiers, database commands, environment files,
deployment and validation commands, cleanup steps, and rollback commands. The final
runbook must contain no placeholder values.

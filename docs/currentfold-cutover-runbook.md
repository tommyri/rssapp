# Currentfold cutover runbook

**One-time document, written 2026-08-06.** This is the operator script for moving the
running product from `rssapp` on `rssapp.badask.no` to **Currentfold** on
`https://app.currentfold.com`, executing Phases 0–4 of
[brand-domain-migration.md](brand-domain-migration.md). Steady-state operation — routine
deploys, releases, backups — stays in [deployment.md](deployment.md); update that
document, not this one, once the cutover is done. Delete or archive this runbook after
the 14-day rollback window closes.

**Every step here is executed by the owner.** Nothing in this document runs from CI, a
timer, or an agent. Each step is labelled with where it runs.

This is an identity cutover, not a platform change. The VPS, Caddy, Docker Compose,
Postgres, and the GHCR pull-image deployment model all stay exactly as they are.

## Settled values

Nothing in this table is a placeholder. Use these literals.

| Thing | Value |
| --- | --- |
| Product / slug | Currentfold / `currentfold` |
| Canonical reader | `https://app.currentfold.com` |
| Apex | `currentfold.com` — reserved for the marketing site; temporary 307 to the reader (step 3.7) |
| Transactional sender | `Currentfold <accounts@send.currentfold.com>` |
| GitHub repository | `tommyri/currentfold` |
| Production image | `ghcr.io/tommyri/currentfold:sha-<tested commit>` (commit derived in step 1.4) |
| Compose project | `currentfold` → containers `currentfold-app-1`, `currentfold-db-1` |
| Postgres database / role | `currentfold` / `currentfold` |
| Volumes | `currentfold_db-data`, `currentfold_backup-data` |
| VPS checkout | `/opt/currentfold` |
| VPS environment file | `/etc/currentfold/production.env` (mode 600, root) |
| VPS backups | `/var/backups/currentfold` |
| Loopback port | `APP_PORT=3100` |
| Apple team ID | `K2Z3B4RGA8` |
| iOS bundle identifier | `com.currentfold.reader` |
| Origin address | derive with `dig +short A rssapp.badask.no` — `152.53.157.89` on 2026-08-06 |
| Rollback window | 14 days from the cutover date |

The old stack stays untouched and running until step 7.6, and stays on disk until day 14:
host `rssapp.badask.no`, checkout `/opt/rssapp`, env `/etc/rssapp/production.env`, Compose
project `rssapp`, port `3000`, backups `/var/backups/rssapp`.

## Decisions this runbook makes

The plan left four things open. They are settled here; read them before starting, because
reversing one mid-cutover is expensive.

1. **Coexistence port `3100`, permanently.** Old production holds `3000` and the plan
   reserves `3001` for the (still deferred) staging tier, so the new stack cannot take
   either during coexistence. Rather than squat on a temporary port and move it after the
   old stack dies — an env edit, a Caddy edit and a restart, for cosmetics — Currentfold
   claims a fresh band it keeps forever: `3100` production, `3101` for staging when it is
   built. During the coexistence window `ss -ltnp` reads unambiguously: 3000 is the thing
   that is dying, 3100 is the product.
2. **Cloudflare Origin CA certificate, not public ACME.** Full (strict) needs the origin
   to present a certificate Cloudflare trusts *before* it will proxy, and Caddy cannot get
   a public certificate for `app.currentfold.com` while the record is proxied
   (TLS-ALPN-01 terminates at Cloudflare). Keeping ACME would mean a grey-cloud phase,
   then a flip, then a permanent dependency on Cloudflare passing HTTP-01 through on every
   renewal. An Origin CA certificate removes the chicken-and-egg entirely, never renews on
   a schedule that can surprise us, and has a useful side effect: the origin's certificate
   is worthless to anyone who is not Cloudflare, so bypassing the edge is visibly wrong
   rather than quietly possible. The cost is one manual rotation, dated in
   [the key ledger](#key-and-certificate-ledger).
3. **The apex gets a temporary 307 to the reader.** A bare `currentfold.com` that resolves
   nowhere reads as a broken purchase, and the redirect costs one DNS record and one rule.
   It is **307, not 301**, deliberately: the apex is reserved for the marketing site, and a
   permanent redirect cached in the owner's own browsers would haunt that launch. Delete
   the rule the day the marketing site ships.
4. **Data moves as one `pg_dump` | `psql` pass into an empty database, before the app's
   first boot.** The dump carries the `drizzle` migration bookkeeping schema with it, so
   the app's boot migrations see a fully migrated database and do nothing. Origin-bound
   and secret-bound rows are purged after the restore (step 5.6) rather than carried
   across, because they cannot work on the new origin and would only show the owner
   credentials and devices that silently do not function.

## Before you start

Set aside a contiguous couple of hours. Between step 5.1 and step 6.1 the reader is down
for the only person who uses it, which is fine — but the DNS, certificate and Cloudflare
work in steps 3 and 4 can and should all be done days earlier, with the old stack still
serving. Nothing before step 5.1 touches production.

**[VPS shell]** Open a root shell once and keep it. Every VPS command below assumes it,
so `sudo` prefixes are dropped (deployment.md's `sudo docker …` form is the same commands
from an unprivileged shell). Too much of this writes to `/etc`, `/var/backups` and
`/var/log` for per-command `sudo` to be anything but a source of half-finished pipelines.

```bash
sudo -i
```

**[VPS shell]** Define both Compose invocations. They are exactly what
`scripts/deploy-image.sh` builds internally, so a command run through them acts on the
same project the deploy script does. Re-run these two assignments in every new root shell
— they do not persist.

```bash
old=(docker compose
  --project-directory /opt/rssapp
  --project-name rssapp
  --env-file /etc/rssapp/production.env
  -f /opt/rssapp/compose.yaml
  -f /opt/rssapp/compose.vps.yaml)

new=(docker compose
  --project-directory /opt/currentfold
  --project-name currentfold
  --env-file /etc/currentfold/production.env
  -f /opt/currentfold/compose.yaml
  -f /opt/currentfold/compose.vps.yaml)
```

Use them as `"${old[@]}" ps` and `"${new[@]}" ps`. The `new` array will not work until
step 4 has created the checkout and the environment file.

---

## 1. Preconditions

### 1.1 Rename the repository — **[GitHub UI]**

Open `https://github.com/tommyri/rssapp` → **Settings** → **General** → **Repository
name**, enter `currentfold`, and confirm.

GitHub keeps redirecting the old path — web, API, and `git` operations — indefinitely,
*unless someone later creates a new repository called `tommyri/rssapp`, which silently
breaks every redirect at once*. Treat the redirect as a grace period, not a permanent
alias, and update remotes now.

### 1.2 Update the local remote — **[local shell]**

```bash
git -C /Users/tommyriska/dev/home/rssapp remote set-url origin git@github.com:tommyri/currentfold.git
git -C /Users/tommyriska/dev/home/rssapp remote -v
git -C /Users/tommyriska/dev/home/rssapp fetch origin
```

Leave the working-directory *name* alone for now. Renaming `~/dev/home/rssapp` invalidates
every tool path, editor workspace and shell history entry that points at it; do it as a
separate deliberate act after the cutover, not in the middle of one.

### 1.3 Confirm the Phase-1 rename is merged and CI is green — **[local shell]**

```bash
gh auth status
gh api repos/tommyri/currentfold --jq '.full_name, .default_branch'
gh run list --repo tommyri/currentfold --branch main --limit 5 \
  --json headSha,conclusion,status,displayTitle,createdAt
```

The newest `main` run must show `"conclusion": "success"`. That run's `verify` job is what
proves `brand:check`, `contract:check`, `deploy:check`, lint, typecheck, tests and build
all pass under the new identity — this runbook has no separate gate for that.

### 1.4 Record the commit you are deploying — **[local shell]**

```bash
git -C /Users/tommyriska/dev/home/rssapp rev-parse origin/main
```

Write that 40-character SHA down. Everything downstream — the image tag, the VPS env file,
the deploy command, the rollback record — names this exact commit. Do not push anything
else to `main` between now and step 6.1: a newer push cancels the run in flight and a
cancelled run never publishes its `sha-` image (see the concurrency note in
`.github/workflows/ci-and-publish.yml`).

### 1.5 Confirm the image exists in the new GHCR package — **[local shell]**

The repository rename does **not** rename the container package. `ghcr.io/tommyri/rssapp`
stays exactly where it is with its history intact; the workflow tags
`ghcr.io/${{ github.repository }}`, so the first push to `main` after the rename *creates
a new package* called `currentfold`. It is private and linked to the repository through
the `org.opencontainers.image.source` label, which means the VPS's existing
`read:packages` token can already read it.

```bash
gh auth refresh -h github.com -s read:packages   # once, if the check below 403s
sha="$(git -C /Users/tommyriska/dev/home/rssapp rev-parse origin/main)"
gh api /user/packages/container/currentfold/versions \
  --jq '.[].metadata.container.tags[]' | grep -x "sha-$sha"
```

Seeing `sha-<your commit>` echoed back is the precondition. The authoritative check is the
`docker pull` in step 4.6 — this one just fails early and cheaply.

---

## 2. Rollback evidence, before anything changes

Phase 0 item 5. Do this first, while the old stack is healthy and unmodified. Everything
in section 8 depends on it existing.

### 2.1 Create the evidence directory — **[VPS shell]**

```bash
evidence="/root/cutover-$(date -u +%Y%m%d)"
install -d -m 700 "$evidence"
echo "$evidence"
```

Re-export `evidence` in any new shell; the rest of this section and section 5 write into it.

### 2.2 Record what is running — **[VPS shell]**

```bash
curl -fsS https://rssapp.badask.no/api/health | tee "$evidence/old-health.json"; echo

app_cid="$("${old[@]}" ps -q app)"
docker inspect --format '{{.Config.Image}}' "$app_cid" | tee "$evidence/old-image-tag.txt"
docker inspect --format '{{range .RepoDigests}}{{println .}}{{end}}' \
  "$(docker inspect --format '{{.Image}}' "$app_cid")" | tee "$evidence/old-image-digest.txt"
"${old[@]}" ps --format json > "$evidence/old-compose-ps.json"
```

Take the image identity from the *running container*, not from `APP_IMAGE` in the
environment file. `deploy-image.sh` accepts an image argument that overrides `APP_IMAGE`
for that run only, so the file can legitimately disagree with what is deployed. The
health response carries the calendar version and full source revision — that is the
human-readable half of the same fact.

### 2.3 Copy the proxy and environment configuration — **[VPS shell]**

```bash
cp -a /etc/caddy/Caddyfile "$evidence/Caddyfile.pre-cutover"
cp -a /etc/rssapp/production.env "$evidence/production.env.pre-cutover"
chmod 600 "$evidence/production.env.pre-cutover"
ls -l "$evidence"
```

The Caddyfile copy matters more than it looks: step 4.7 edits the *global options* block
of that same shared file, so this is the only unmodified copy of the pre-cutover proxy
configuration. Section 8 restores it verbatim.

The environment copy contains live secrets. It stays on the VPS at mode 600. Do not copy
it to a laptop, a password manager note, or a chat message.

### 2.4 Take and verify a database backup — **[VPS shell]**

An untested backup is only a hope, so this one gets restored into a throwaway database in
the same cluster and counted.

```bash
df -h /var/lib/docker /var/backups
install -d -m 700 /var/backups/rssapp

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
precut="/var/backups/rssapp/pre-cutover-$stamp.sql.gz"
"${old[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip -c > "$precut"
gzip -t "$precut" && ls -lh "$precut"
```

`pg_dump` takes an MVCC-consistent snapshot, so this is safe with the app still serving.
The old cluster's role and database names are whatever its volume was initialised with
years ago — read them out of the container's own environment with `sh -c` rather than
guessing them.

```bash
"${old[@]}" exec -T db sh -c 'createdb -U "$POSTGRES_USER" rollback_verify'
gunzip -c "$precut" \
  | "${old[@]}" exec -T db sh -c 'psql -v ON_ERROR_STOP=1 -q -U "$POSTGRES_USER" -d rollback_verify'
"${old[@]}" exec -T db sh -c 'psql -At -U "$POSTGRES_USER" -d rollback_verify -c "select (select count(*) from users) users, (select count(*) from items) items, (select count(*) from saved_pages) saved_pages"' \
  | tee "$evidence/backup-verify-counts.txt"
"${old[@]}" exec -T db sh -c 'dropdb -U "$POSTGRES_USER" rollback_verify'
```

Non-zero counts that look like the real reader mean the dump is restorable. Drop the
verification database before moving on — leaving it doubles the cluster's disk footprint.

---

## 3. Cloudflare

`currentfold.com` was bought at Cloudflare Registrar, so the zone already exists in the
account and Cloudflare is already authoritative. There is no nameserver change to make and
no zone to add.

### 3.1 Confirm the zone is active — **[Cloudflare dashboard]**

Open the account → **Websites** → `currentfold.com`. The **Overview** page must show
status **Active**. Registrar-purchased zones normally activate within minutes of purchase;
if it still says Pending, stop and wait — every step below is a no-op on a pending zone.

### 3.2 Derive the origin address — **[local shell]**

```bash
dig +short A rssapp.badask.no
```

That is the VPS. On 2026-08-06 it returns `152.53.157.89`; use whatever the command prints
today.

### 3.3 Check whether the VPS has public IPv6 — **[VPS shell]**

```bash
ip -6 addr show scope global
```

Today this returns nothing — the VPS is IPv4-only, and `dig +short AAAA rssapp.badask.no`
is correspondingly empty. **Do not create an AAAA record for `app`.** Cloudflare serves
IPv6 to visitors regardless of what the origin speaks; a proxied AAAA pointing at an
address the VPS does not hold would break exactly the clients IPv6 was meant to help. Add
one only if that `ip -6` command starts printing a global address.

### 3.4 Create the reader record — **[Cloudflare dashboard]**

**DNS** → **Records** → **Add record**:

| Field | Value |
| --- | --- |
| Type | `A` |
| Name | `app` |
| IPv4 address | the output of step 3.2 |
| Proxy status | **Proxied** (orange cloud) |
| TTL | Auto |

Proxied from the start. There is no grey-cloud phase in this plan — the Origin CA
certificate in step 3.6 is what makes that possible.

### 3.5 Generate the origin key and CSR on the VPS — **[VPS shell]**

The private key is generated on the machine that will use it and never leaves it. Letting
Cloudflare generate the key would put it through a browser and a clipboard for no benefit.

```bash
install -d -m 700 /etc/caddy/origin
openssl req -new -newkey rsa:2048 -nodes \
  -keyout /etc/caddy/origin/app.currentfold.com.key \
  -out    /etc/caddy/origin/app.currentfold.com.csr \
  -subj "/CN=app.currentfold.com"
chmod 600 /etc/caddy/origin/app.currentfold.com.key
cat /etc/caddy/origin/app.currentfold.com.csr
```

RSA 2048 rather than ECDSA: Cloudflare Origin CA accepts both, the handshake cost between
Cloudflare and one VPS is irrelevant, and RSA removes any question about the OpenSSL
version on the box.

### 3.6 Issue and install the Origin CA certificate — **[Cloudflare dashboard]**, then **[VPS shell]**

**SSL/TLS** → **Origin Server** → **Origin Certificates** → **Create Certificate**:

1. Choose **Use my private key and CSR** and paste the CSR printed by step 3.5.
2. In the hostname list, **remove the pre-filled `currentfold.com` and `*.currentfold.com`**
   and enter only `app.currentfold.com`. The apex is served by a redirect rule, not by
   this origin, and a wildcard would hand one VPS a certificate for subdomains it does not
   serve.
3. **Certificate Validity: 5 years.** Cloudflare offers 15; five is long enough that the
   renewal is a non-event and short enough that a long-lived origin key still gets rotated
   inside a sane horizon. The date is recorded in
   [the key ledger](#key-and-certificate-ledger).
4. **Key Format: PEM.**
5. Copy the **Origin Certificate** block. There is no private key to copy — Cloudflare
   signed the one that stayed on the VPS.

Back on the VPS:

```bash
cat > /etc/caddy/origin/app.currentfold.com.crt <<'PEM'
-----BEGIN CERTIFICATE-----
… paste the Origin Certificate block from the dashboard here …
-----END CERTIFICATE-----
PEM
chmod 644 /etc/caddy/origin/app.currentfold.com.crt
```

Verify the certificate and prove it matches the key that never left the box — the two
digests must be identical:

```bash
openssl x509 -in /etc/caddy/origin/app.currentfold.com.crt -noout -subject -issuer -dates
openssl x509 -in /etc/caddy/origin/app.currentfold.com.crt -noout -pubkey | openssl sha256
openssl pkey -in /etc/caddy/origin/app.currentfold.com.key -pubout | openssl sha256
```

Issuer should read `CloudFlare Origin SSL Certificate Authority`.

**Leave the zone's encryption mode alone for now.** Step 4.9 switches it to Full (strict),
after Caddy is actually presenting this certificate. Flipping it first buys a 526.

### 3.7 Park the apex on a temporary redirect — **[Cloudflare dashboard]**

A redirect rule needs a proxied record to attach to, and the apex has no origin. The
standard trick is the IPv6 discard prefix.

**DNS** → **Add record**:

| Field | Value |
| --- | --- |
| Type | `AAAA` |
| Name | `@` |
| IPv6 address | `100::` |
| Proxy status | **Proxied** |

Then **Rules** → **Redirect Rules** → **Create rule**:

- Name: `apex to reader (temporary)`
- When incoming requests match: **Custom filter expression**, field **Hostname**, operator
  **equals**, value `currentfold.com`
- Then: **Dynamic** redirect
- Expression: `concat("https://app.currentfold.com", http.request.uri.path)`
- Status code: **307**
- **Preserve query string: on**

307, not 301 — see [Decisions](#decisions-this-runbook-makes). Optionally repeat the pair
for `www` (a proxied `AAAA www 100::` and a second rule on hostname `www.currentfold.com`)
if you want a dead `www` to behave; skip it otherwise.

### 3.8 TLS and security baseline — **[Cloudflare dashboard]**

Conservative means "cannot break a native client". Set these:

| Setting | Where | Value | Why |
| --- | --- | --- | --- |
| SSL/TLS encryption mode | SSL/TLS → Overview | **leave as-is until step 4.9**, then Full (strict) | Requires the origin certificate to be live first. |
| Always Use HTTPS | SSL/TLS → Edge Certificates | **On** | |
| Minimum TLS Version | SSL/TLS → Edge Certificates | **TLS 1.2** | |
| TLS 1.3 | SSL/TLS → Edge Certificates | **On** | |
| HSTS | SSL/TLS → Edge Certificates | **Off, for now** | The setting is zone-wide and `includeSubDomains` would pin every future subdomain, including whatever the marketing site needs. Revisit once the apex is real. |
| Bot Fight Mode | Security → Bots | **Off** | Free-tier Bot Fight Mode cannot be scoped by path and challenges non-browser clients. The iOS app, the share extension, Google Reader-compatible clients, and Apple's AASA fetcher are all non-browser clients. |
| Browser Integrity Check | Security → Settings | **On** (default) | Cheap. If native clients ever start receiving Cloudflare 403 interstitials, this is the first switch to try. |
| Security Level | Security → Settings | **Medium** (default) | |
| Cloudflare Free Managed Ruleset | Security → WAF → Managed rules | **On** (default) | |
| Rocket Loader | Speed → Optimization → Content | **Off** | Rewrites and defers scripts; a reliable way to break React hydration. |
| Email Address Obfuscation | Scrape Shield | **Off** | Injects a script into served HTML. Nothing in the reader benefits, and it only adds a way for the edge to change the document. |

Add one rate-limiting rule — the free plan allows exactly one, so spend it on the browser
sign-in surface rather than on `/api/*`, where a challenge is unrenderable and the native
clients live. **Security** → **WAF** → **Rate limiting rules** → **Create rule**:

- Name: `sign-in burst`
- Expression: `(http.request.method eq "POST" and http.request.uri.path in {"/login" "/signup" "/reset-password"})`
- Characteristics: **IP**
- Rate: **50 requests per 10 seconds**
- Action: **Managed Challenge**, duration 10 seconds

This is an outer bound only. The real limits are the per-email and per-network counters in
`apps/web/src/lib/auth-rate-limit.ts`, which is precisely why step 4.7 has to make the
client IP those counters see trustworthy.

Add one cache rule. **Caching** → **Cache Rules** → **Create rule**:

- Name: `bypass API`
- Expression: `starts_with(http.request.uri.path, "/api/")`
- Cache eligibility: **Bypass cache**

**Do not add a cache-everything rule anywhere.** Authenticated HTML and `/api/*` are
per-user and must stay dynamic. `/.well-known/apple-app-site-association` is deliberately
left cacheable — the route sets `cache-control: public, max-age=3600` on purpose.

One consequence to know before it surprises you: Cloudflare's free plan drops a request
at 100 seconds with a **524**. The scheduler does feed polling in the background, but the
**Refresh** button issues a server action that can exceed that on a large refresh. A 524
there means the edge gave up, not that the refresh failed — the server keeps going.

### 3.9 What not to create yet — **[Cloudflare dashboard]**

- **No MX, SPF, DKIM or DMARC records.** They arrive with Resend verification in step 7.4,
  with values Resend generates for this specific domain.
- **No `staging` record.** The staging tier is deliberately deferred.
- **No AAAA for `app`** (step 3.3).
- **No record for `rssapp.badask.no`.** That name lives in the `badask.no` zone, wherever
  that is hosted, and is not touched until day 14.

---

## 4. Prepare the new stack beside the running one

Nothing in this section touches the old stack or the old hostname. The old reader keeps
serving throughout.

### 4.1 Clone the renamed repository — **[VPS shell]**

```bash
git clone git@github.com:tommyri/currentfold.git /tmp/currentfold
mv /tmp/currentfold /opt/currentfold
git -C /opt/currentfold rev-parse HEAD
```

Keep it a clean checkout. Server-specific configuration belongs in
`/etc/currentfold/production.env`, never in `compose.yaml`. Routine deployments never pull;
update this checkout deliberately with `git -C /opt/currentfold pull --ff-only` only when
Compose files or scripts change.

**Do not run `git pull` in `/opt/rssapp`.** It would replace the old stack's Compose files
and deploy script with renamed ones and break the rollback path in section 8. The old
checkout stays pinned at its pre-rename commit until it is deleted on day 14.

### 4.2 Verify the deploy script's renamed defaults — **[VPS shell]**

```bash
grep -n 'CONFIG_DIR\|BACKUP_DIR\|project_name' /opt/currentfold/scripts/deploy-image.sh
grep -n '^name:' /opt/currentfold/compose.yaml
```

Expect exactly this:

```text
config_dir="${CURRENTFOLD_CONFIG_DIR:-/etc/currentfold}"
project_name="currentfold"
  project_name="currentfold-staging"
backup_dir="${CURRENTFOLD_DEPLOY_BACKUP_DIR:-/var/backups/currentfold}"
name: currentfold
```

If any of those still read `rssapp`, **stop** and fix it in the repository rather than
working around it here — a deploy script that writes pre-deploy backups into
`/var/backups/rssapp` would quietly interleave the two stacks' backups during the very
window where telling them apart matters most. The stopgap, if the fix has not landed, is
`CURRENTFOLD_CONFIG_DIR=/etc/currentfold bash …`, but that still leaves the backup path
wrong.

`compose.yaml` carrying its own `name: currentfold` is the belt to the deploy script's
braces: a bare `docker compose` run from `/opt/currentfold` lands in the right project even
without `--project-name`. The `new` array above passes it explicitly anyway.

### 4.3 Create the protected directories — **[VPS shell]**

```bash
install -d -m 700 /etc/currentfold /var/backups/currentfold
install -m 600 /dev/null /etc/currentfold/production.env
```

### 4.4 Generate the new secrets — **[VPS shell]**

Every one of these is new. The session secret changing is what ends the old sessions; the
VAPID pair changing is what abandons the old push subscriptions. That is the intent, not a
side effect.

```bash
openssl rand -hex 24        # POSTGRES_PASSWORD — hex avoids URL-encoding surprises in DATABASE_URL
openssl rand -base64 48     # AUTH_SECRET
docker run --rm node:22-alpine npx --yes web-push generate-vapid-keys --json
```

The VAPID pair is generated in a throwaway container so the VPS needs no Node installation.
Copy all four values straight into the file in the next step; do not park them anywhere else.

### 4.5 Write the environment file — **[VPS shell]**

```bash
sudoedit /etc/currentfold/production.env    # or: nano /etc/currentfold/production.env
```

Every variable the application reads, with real values where they are known and the
generating command named where they are secret:

```dotenv
APP_IMAGE=ghcr.io/tommyri/currentfold:sha-<the 40-char commit from step 1.4>
APP_PORT=3100

POSTGRES_USER=currentfold
POSTGRES_PASSWORD=<openssl rand -hex 24, from step 4.4>
POSTGRES_DB=currentfold
DATABASE_URL=postgres://currentfold:<the same password>@db:5432/currentfold

AUTH_SECRET=<openssl rand -base64 48, from step 4.4>
APP_URL=https://app.currentfold.com

SCHEDULER_TICK_MS=60000
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION=14

# Filled in step 7.4, once send.currentfold.com is verified in Resend.
RESEND_API_KEY=
EMAIL_FROM=Currentfold <accounts@send.currentfold.com>

# Copied from /etc/rssapp/production.env now; the callback is added in step 7.3.
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=

# Deliberately empty. Sign in with Apple stays off until the production-readiness
# checklist in sign-in-with-apple.md is complete — setting this variable is not the gate.
APPLE_NATIVE_CLIENT_ID=
APPLE_TEAM_ID=K2Z3B4RGA8

VAPID_SUBJECT=mailto:accounts@currentfold.com
VAPID_PUBLIC_KEY=<from step 4.4>
VAPID_PRIVATE_KEY=<from step 4.4>
```

Three things about this file that bite:

- **`EMAIL_FROM` is unquoted and must not carry a trailing comment.** Compose's dotenv
  parser takes the rest of the line literally, but a `#` anywhere after the value starts a
  comment and would truncate the address.
- **`POSTGRES_PASSWORD` and `DATABASE_URL` must agree.** The volume is created fresh in
  step 5.3, so this password is the one Postgres initialises with — unlike the old stack,
  where changing it in Compose would have done nothing.
- **`VAPID_SUBJECT` must be a mailbox that can receive mail.** `accounts@currentfold.com`
  becomes real in step 7.5; until then it is aspirational, which is acceptable because
  push services only use it to contact you about abuse.

Copy the Google credentials across now so sign-in works at first boot:

```bash
grep -E '^AUTH_GOOGLE_(ID|SECRET)=' /etc/rssapp/production.env
```

Reusing the same OAuth client is intentional — step 7.3 adds the new callback to it. Note
that reusing it means deleting the old environment file on day 14 does **not** rotate that
secret.

Confirm the permissions survived editing:

```bash
ls -l /etc/currentfold/production.env    # -rw------- root root
```

### 4.6 Pull the image — **[VPS shell]**

```bash
sha="<the 40-char commit from step 1.4>"
docker pull "ghcr.io/tommyri/currentfold:sha-$sha"
```

The registry credential already stored for root covers the whole `ghcr.io` registry and the
account behind it can read the new package, so no new login is needed. If this returns
`denied` or `unauthorized`, the `read:packages` token has expired — recreate it and log in
again exactly as in deployment.md §3, then retry. Do not put that token in
`/etc/currentfold/production.env`; it is a Docker daemon credential, not an application
secret.

### 4.7 Add the Caddy configuration — **[VPS shell]**

Two edits to `/etc/caddy/Caddyfile`: a global options block, and the new site.

First the global block. It must appear **once**, at the very top of the file, before any
site block — if a global block already exists, merge these directives into it rather than
adding a second one.

Generate the current Cloudflare ranges rather than trusting a list from memory; a missing
range does not fail loudly, it silently makes every visitor look like a Cloudflare edge
address and collapses per-IP rate limiting into one bucket:

```bash
{ curl -fsS https://www.cloudflare.com/ips-v4; echo; curl -fsS https://www.cloudflare.com/ips-v6; } \
  | tr '\n' ' '; echo
```

Paste that output as the argument list:

```caddyfile
{
	servers {
		trusted_proxies static <paste the space-separated ranges printed above>
		client_ip_headers Cf-Connecting-Ip
		trusted_proxies_strict
	}
}
```

`client_ip_headers Cf-Connecting-Ip` replaces Caddy's default of `X-Forwarded-For`
deliberately: Cloudflare *appends* to a visitor-supplied `X-Forwarded-For` but *overwrites*
`CF-Connecting-IP`, so only the latter is authoritative. `trusted_proxies_strict` makes
Caddy parse right-to-left. Together they mean `{client_ip}` is the real visitor for
requests that arrived through Cloudflare, and the raw peer address for anything that did
not — including `rssapp.badask.no`, which is unaffected by this block because its visitors
are never inside a Cloudflare range.

Then the site block, appended to the file:

```caddyfile
app.currentfold.com {
	tls /etc/caddy/origin/app.currentfold.com.crt /etc/caddy/origin/app.currentfold.com.key

	log {
		output file /var/log/caddy/app.currentfold.com.log
		format json
	}

	reverse_proxy 127.0.0.1:3100 {
		header_up X-Forwarded-For {client_ip}
		header_up X-Real-IP       {client_ip}
		header_up CF-Connecting-IP {client_ip}
	}
}
```

Naming the certificate files switches off Caddy's certificate management for this host, so
it will not attempt ACME for a name it can never validate through the proxy.

The three `header_up` lines are the Cloudflare record policy's "overwrite untrusted
forwarding headers before requests reach application rate limiting", made concrete.
`networkRateLimitKeyFromHeaders` in `apps/web/src/lib/auth-rate-limit.ts` reads
`x-forwarded-for` first, then `x-real-ip`, then `cf-connecting-ip` — so all three have to
carry the trusted value, or a request that arrives at the origin directly can choose its
own rate-limit bucket by inventing the first one.

Create the log directory and reload:

```bash
systemctl show -p User --value caddy          # normally: caddy
install -d -o caddy -g caddy -m 750 /var/log/caddy
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile
systemctl reload caddy
```

### 4.8 Prove the origin presents the certificate — **[VPS shell]**

```bash
openssl s_client -connect 127.0.0.1:443 -servername app.currentfold.com </dev/null 2>/dev/null \
  | openssl x509 -noout -subject -issuer -dates
```

Subject `CN = app.currentfold.com`, issuer `CloudFlare Origin SSL Certificate Authority`,
unexpired. Those are exactly Full (strict)'s three requirements. Do not proceed until this
output is right.

### 4.9 Switch the zone to Full (strict) — **[Cloudflare dashboard]**

**SSL/TLS** → **Overview** → **SSL/TLS encryption mode** → **Full (strict)**.

### 4.10 Confirm the edge reaches the origin — **[local shell]**

```bash
curl -sS -o /dev/null -w '%{http_code}\n' https://app.currentfold.com/api/health
```

Expect **502**. The app container does not exist yet, so Caddy has nothing to proxy to —
that is correct and it is the answer you want. A **525** or **526** means the TLS handshake
between Cloudflare and Caddy failed; go back to step 4.8. A **521** means Cloudflare cannot
reach the VPS at all.

---

## 5. Move the data

Production goes down here. From 5.1 until 6.1 the reader is unavailable.

### 5.1 Quiesce the old application — **[VPS shell]**

```bash
"${old[@]}" stop app
"${old[@]}" ps
```

Only the app container stops. Postgres stays up — the dump comes out of it, and section 8
needs it running to roll back. Confirm `db` is still `running` and `app` is `exited`.

### 5.2 Take the final dump — **[VPS shell]**

```bash
stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="/var/backups/rssapp/final-$stamp.sql.gz"
"${old[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" --no-owner --no-privileges' \
  | gzip -c > "$final"
gzip -t "$final" && ls -lh "$final"
echo "$final"
```

`--no-owner --no-privileges` because the new cluster has a role called `currentfold`, not
whatever the old one is called; without them the restore emits `ALTER … OWNER TO` and
`GRANT` statements naming a role that does not exist there.

No `-n public`. The dump must carry **every** schema, because Drizzle's migration
bookkeeping lives in a separate `drizzle` schema — that is what tells the app's boot
migrations there is nothing to do. Restore only `public` and the app will try to re-run
every migration from `0000` against tables that already exist.

This file is the rollback artifact. Get a copy off the VPS now rather than at day 14, when
the hostname may already be gone. The VPS prints the exact command to run on the laptop:

```bash
home="$(getent passwd "$SUDO_USER" | cut -d: -f6)"
install -o "$SUDO_USER" -g "$SUDO_USER" -m 600 "$final" "$home/$(basename "$final")"
printf 'mkdir -p ~/Backups/currentfold-cutover && scp %s@rssapp.badask.no:~/%s ~/Backups/currentfold-cutover/\n' \
  "$SUDO_USER" "$(basename "$final")"
```

Run that printed line — **[local shell]** — then remove the staging copy from the VPS home
directory:

```bash
rm -f "$home/$(basename "$final")"
```

### 5.3 Start the new database only — **[VPS shell]**

```bash
"${new[@]}" up -d --wait db
"${new[@]}" ps
```

Only `db`. Starting the app first would run boot migrations and create the schema, and the
restore in 5.5 would then collide with tables that already exist. This is also the moment
the `currentfold_db-data` volume is created and Postgres initialises the `currentfold` role
and database from `POSTGRES_USER`/`POSTGRES_DB`.

### 5.4 Confirm it is empty — **[VPS shell]**

```bash
"${new[@]}" exec -T db psql -At -U currentfold -d currentfold -c \
  "select count(*) from information_schema.tables where table_schema not in ('pg_catalog','information_schema')"
```

Must print `0`. The new stack's role and database names are known literals, so unlike the
old stack there is no need to read them out of the container environment.

### 5.5 Restore — **[VPS shell]**

```bash
[ -s "$final" ] && echo "restoring $final"   # empty means the shell lost the variable
gunzip -c "$final" | "${new[@]}" exec -T db psql -v ON_ERROR_STOP=1 -q -U currentfold -d currentfold
```

If `$final` is empty, re-point it at the newest dump rather than guessing:
`final="$(ls -1t /var/backups/rssapp/final-*.sql.gz | head -1)"`.

`ON_ERROR_STOP=1` so a partial restore fails loudly instead of leaving a plausible-looking
half-database. On success `psql` prints nothing.

### 5.6 Purge the rows that cannot survive the move — **[VPS shell]**

These tables hold state bound to the old origin or hashed with the old secret. Carrying
them across would leave the owner looking at a settings screen listing sessions, devices
and app passwords that can never work again.

```bash
"${new[@]}" exec -T db psql -v ON_ERROR_STOP=1 -U currentfold -d currentfold <<'SQL'
begin;
delete from native_app_sessions;   -- native_app_session_tokens cascades
delete from api_access_tokens;
delete from auth_sessions;
delete from push_subscriptions;
delete from account_tokens;
delete from oauth_intents;
delete from auth_rate_limits;
commit;
SQL
```

Row by row, why:

- `auth_sessions` — `AUTH_SECRET` is new, so every existing session cookie is
  unverifiable regardless.
- `api_access_tokens` — old app passwords carry the `rssapp_api_` prefix the renamed
  validator no longer accepts.
- `native_app_sessions` — device sessions issued against the old origin; the token table
  cascades on delete.
- `push_subscriptions` — bound to both the old HTTPS origin and the old VAPID pair.
- `account_tokens` — pending verification, reset and invitation tokens whose links point at
  `rssapp.badask.no`.
- `oauth_intents` — short-lived and origin-bound.
- `auth_rate_limits` — keys are hashed with `AUTH_SECRET` (see `hashAuthRateLimitKey`), so
  after the secret rotation not one row can ever be matched again. They are pure ballast.

Reading state, subscriptions, saved pages, highlights, rules and digest settings are
untouched by this. That is the data the transfer exists to preserve.

### 5.7 Compare row counts — **[VPS shell]**

```bash
cat > "$evidence/counts.sql" <<'SQL'
select 'users' t, count(*) n from users
union all select 'feeds', count(*) from feeds
union all select 'folders', count(*) from folders
union all select 'subscriptions', count(*) from subscriptions
union all select 'items', count(*) from items
union all select 'item_states', count(*) from item_states
union all select 'item_audio_progress', count(*) from item_audio_progress
union all select 'labels', count(*) from labels
union all select 'item_labels', count(*) from item_labels
union all select 'rules', count(*) from rules
union all select 'notifications', count(*) from notifications
union all select 'notification_digest_settings', count(*) from notification_digest_settings
union all select 'saved_pages', count(*) from saved_pages
union all select 'saved_page_labels', count(*) from saved_page_labels
union all select 'highlights', count(*) from highlights
union all select 'oauth_identities', count(*) from oauth_identities
order by 1;
SQL

"${old[@]}" exec -T db sh -c 'psql -At -F"|" -U "$POSTGRES_USER" -d "$POSTGRES_DB"' \
  < "$evidence/counts.sql" > "$evidence/counts-old.txt"
"${new[@]}" exec -T db psql -At -F'|' -U currentfold -d currentfold \
  < "$evidence/counts.sql" > "$evidence/counts-new.txt"

diff "$evidence/counts-old.txt" "$evidence/counts-new.txt" && echo "row counts match"
cat "$evidence/counts-new.txt"
```

The list deliberately excludes everything step 5.6 purged, so a clean `diff` is the
expected result. Any difference means stop and investigate before starting the app —
this is the last moment where the old database is still the only authority.

---

## 6. First start and validation

### 6.1 Deploy — **[VPS shell]**

Confirm the pinned image first, then deploy with no image argument — `APP_IMAGE` in the
environment file already names the commit from step 1.4, and reading it back is a cheaper
check than trusting a shell variable that may not have survived the section boundary:

```bash
grep '^APP_IMAGE=' /etc/currentfold/production.env
bash /opt/currentfold/scripts/deploy-image.sh production
```

The script starts the database if needed (already up), writes a pre-deploy dump into
`/var/backups/currentfold`, pulls the image, starts the app, and waits for
database-backed `/api/health`. Boot migrations run inside the app container and should be
a no-op against the restored schema. If it does not come up:

```bash
"${new[@]}" logs --tail=200 app
"${new[@]}" ps
```

### 6.2 Health and capabilities — **[local shell]**

```bash
curl -fsS https://app.currentfold.com/api/health | jq .
```

Expect `"status": "ok"` plus the calendar `version`, full `revision` and `shortRevision`.
The `revision` must equal the commit from step 1.4 — that is the check that the running
container is the image CI verified.

```bash
curl -fsS https://app.currentfold.com/api/v1 \
  | jq -e '(["savedPages","subscriptionCreate","articleReadingProgress"] - .data.capabilities) == []' \
  && echo "capability list complete"
```

That exits non-zero if any of the three is missing. Print the whole list if you want to
eyeball it: `curl -fsS https://app.currentfold.com/api/v1 | jq .data.capabilities`.

### 6.3 Apple app site association — **[local shell]**

```bash
curl -fsSI https://app.currentfold.com/.well-known/apple-app-site-association
curl -fsS  https://app.currentfold.com/.well-known/apple-app-site-association \
  | jq -e '.applinks.details[0].appID == "K2Z3B4RGA8.com.currentfold.reader"' \
  && echo "AASA carries the right appID"
```

Expect `200` and `content-type: application/json`, with **no redirect in the chain** —
Apple fetches this document directly and will not follow one. A `404` means `APPLE_TEAM_ID`
is missing or malformed in the environment file.

### 6.4 Confirm the visitor IP is real — **[VPS shell]**

Make a request from the laptop, then read what Caddy recorded:

```bash
tail -n 5 /var/log/caddy/app.currentfold.com.log | jq -r '[.request.client_ip, .request.remote_ip, .request.uri] | @tsv'
```

`client_ip` must be your laptop's public address; `remote_ip` will be a Cloudflare edge
address. If `client_ip` also shows a Cloudflare address, the range list in step 4.7 is
wrong or incomplete, and every per-network rate limit in the app is currently sharing one
bucket. Fix it before going further — this failure is silent everywhere else.

### 6.5 Sign in and exercise the reader — **[local shell / browser]**

Everything here is a browser check at `https://app.currentfold.com`. The session, the PWA,
offline data and push all start from nothing by design.

1. **Sign in** with the password account. Google sign-in will not work yet — step 7.3 adds
   the callback.
2. **Sidebar counts** render, and match roughly what the old reader showed.
3. **Feed refresh**: press **Refresh** ("Refresh all feeds"). New items appear; a 524 from
   Cloudflare on a large refresh means the edge timed out, not that the refresh failed
   (step 3.8) — reload and check.
4. **Saved page**: save a URL and confirm the extracted copy renders. This is the path
   that makes the server fetch a third-party URL, so it also proves outbound networking
   from the container.
5. **Reading state** written on the new origin persists across a reload.
6. **Settings → app password**: create one, confirm it is issued with the new
   `currentfold_api_` prefix, and check the API accepts it:

   ```bash
   curl -fsS -H "Authorization: Bearer <the app password you just copied>" \
     https://app.currentfold.com/api/v1/me | jq .
   ```

### 6.6 Point the iOS build at the new origin — **[local shell]**

Two build settings in `apps/ios/project.yml` still name the old host:

```bash
grep -n 'CURRENTFOLD_SERVER_URL\|CURRENTFOLD_ASSOCIATED_DOMAIN' /Users/tommyriska/dev/home/rssapp/apps/ios/project.yml
```

Set `CURRENTFOLD_SERVER_URL: https://app.currentfold.com` and
`CURRENTFOLD_ASSOCIATED_DOMAIN: app.currentfold.com`. They must agree — the associated
domain has to be the `APP_URL` host or universal links silently stop opening in the app.
Then regenerate and build:

```bash
npm --prefix /Users/tommyriska/dev/home/rssapp run ios:generate
```

Build and run on a real device (not the simulator — associated domains and the share
extension both need it), signed with an App ID that has the Associated Domains capability
under team `K2Z3B4RGA8`.

### 6.7 Validate on device — **[iPhone]**

1. Sign in with the app password or the password account.
2. Article list, reading progress and saved pages all load from the new origin.
3. **Share extension**: share a URL from Safari into **Save to Currentfold**, then confirm
   the saved page appears in both the app and the web reader. The extension resolves its
   server through the same `AppConfiguration`, so this also proves the two binaries agree
   about which Currentfold they are talking to.
4. **Universal link**: open a `https://app.currentfold.com/verify-email…` style link and
   confirm it opens the app rather than Safari. If it opens Safari, delete and reinstall
   the app — iOS caches the AASA per install.

---

## 7. Post-validation

Only start this section once section 6 passed. Until step 7.4, transactional email is
dark: `RESEND_API_KEY` is empty, so verification, reset, invitation and digest mail do not
send. Nothing in validation depends on it — the owner's account arrived already verified
in the transferred data — but **do not invite anyone or trigger a password reset in this
window**, because the message will not arrive and the token will expire unused.

### 7.1 Watch it for a bit — **[VPS shell]**

```bash
"${new[@]}" logs --tail=200 app
journalctl -u caddy -n 100 --no-pager
```

Give the scheduler at least one tick (60 s) and one poll cycle before deciding it is fine.

### 7.2 Google OAuth: authorized domain and branding — **[Google Cloud Console]**

Open **Google Auth Platform** → **Branding** for the existing project:

- App name: **Currentfold**
- App home page: `https://app.currentfold.com`
- Authorized domain: **`currentfold.com`** (the top private domain — it covers
  `app.currentfold.com`)
- Privacy policy and Terms of Service URLs

Two warnings. Adding an authorized domain requires proving ownership of `currentfold.com`
in **Google Search Console**, normally by adding a TXT record — add it in Cloudflare DNS
as a plain **DNS-only** TXT record on `@`. And the privacy-policy and terms URLs do not
exist yet: they are the apex marketing site, which is separately on the App Store critical
path. Fill them in when that site ships; branding changes can wait, the callback in 7.3
cannot.

### 7.3 Google OAuth: callback — **[Google Cloud Console]**

**Clients** → the existing **Web application** client → **Authorized redirect URIs** → add
exactly:

```text
https://app.currentfold.com/api/auth/callback/google
```

Leave the old `rssapp.badask.no` URI in place for now; it is removed in the day-14 cleanup
so that a rollback still has working Google sign-in. Then confirm — **[local shell]**:

```bash
curl -fsS https://app.currentfold.com/api/v1/auth/providers | jq .
```

and sign in with **Continue with Google** in the browser. A `redirect_uri_mismatch` means
the URI does not match character for character.

### 7.4 Resend: verify the sending subdomain — **[Resend dashboard]** and **[Cloudflare dashboard]**

1. In Resend, **Domains** → **Add Domain** → `send.currentfold.com`.
2. Resend generates three records. Add each in Cloudflare DNS, **all DNS-only (grey
   cloud)** — a proxied mail record breaks verification:

   | Type | Name to enter in Cloudflare | Value |
   | --- | --- | --- |
   | `MX` | `send` | the `feedback-smtp.<region>.amazonses.com` host Resend shows, priority `10` |
   | `TXT` | `send` | `v=spf1 include:amazonses.com ~all` |
   | `TXT` | `resend._domainkey.send` | the DKIM public key Resend shows |

   **Cloudflare appends the zone name automatically.** Enter `send`, not
   `send.currentfold.com`, or you will create `send.currentfold.com.currentfold.com`. This
   is the single most common way this step fails.
3. Add a deliberate DMARC record — `TXT`, name `_dmarc`, DNS-only:

   ```text
   v=DMARC1; p=none; rua=mailto:accounts@currentfold.com; adkim=r; aspf=r
   ```

   Start at `p=none` and read the aggregate reports. Move to `p=quarantine` after fourteen
   clean days, once step 7.5 has made that `rua` mailbox reachable.
4. Wait for Resend to report the domain **Verified**.
5. Create a **new** API key scoped to sending only, named `currentfold production`. Do not
   reuse the old key: a key that predates the cutover is one more thing tying the new
   product to the old identity, and step 7.9 revokes it.
6. **[VPS shell]** Put the key in the environment file and redeploy the same image so the
   container picks it up:

   ```bash
   sudoedit /etc/currentfold/production.env      # set RESEND_API_KEY=
   bash /opt/currentfold/scripts/deploy-image.sh production
   ```

   No image argument — `APP_IMAGE` in the file already names the tested SHA.
7. **[local shell / browser]** In **Settings**, press **Send test digest** and confirm the
   message arrives from `Currentfold <accounts@send.currentfold.com>`, passes SPF and DKIM
   (check the receiving client's "show original"), and that every link in it points at
   `app.currentfold.com`.

### 7.5 Make `accounts@currentfold.com` reachable — **[Cloudflare dashboard]**

Two things now depend on that address receiving mail: the DMARC `rua` target and
`VAPID_SUBJECT`. Cloudflare Email Routing solves it for free.

**Email** → **Email Routing** → enable, then add a custom address `accounts@currentfold.com`
forwarding to your real mailbox, and let Cloudflare add the records it asks for.

This does not conflict with Resend. Email Routing's MX and SPF records land on the **apex**;
Resend's land on **`send.`**. Different names, no collision. This is the "concrete need"
the plan reserved email routing for.

### 7.6 Remove the old host from Caddy — **[VPS shell]**

```bash
cp -a /etc/caddy/Caddyfile "$evidence/Caddyfile.before-old-host-removal"
sudoedit /etc/caddy/Caddyfile          # delete the whole rssapp.badask.no { … } block
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile
systemctl reload caddy

curl -sS -o /dev/null -w '%{http_code}\n' https://rssapp.badask.no/api/health || echo "old host no longer served"
```

No redirect. The plan is explicit: the old domain is removed, not forwarded.

**Leave the `rssapp.badask.no` DNS record alone until day 14.** This is a deliberate
departure from a literal reading of Phase 3 step 6, and the reason is section 8: with the
Caddy block gone the name serves nothing at all — the TLS handshake fails because no site
matches that SNI — so it is not a compatibility host in any meaningful sense, but keeping
the record means an emergency rollback is a Caddy reload rather than a DNS change plus a
TTL wait. The record is deleted in the day-14 cleanup.

### 7.7 Stop, do not delete, the old stack — **[VPS shell]**

```bash
"${old[@]}" stop
"${old[@]}" ps -a
docker volume ls | grep -E 'rssapp_(db|backup)-data'
```

`stop`, never `down`. Both containers stop; the network, the volumes and the checkout all
survive. The `rssapp_db-data` volume is half of the rollback plan.

### 7.8 Record the retained artifacts — **[VPS shell]**

```bash
ls -lh /var/backups/rssapp/final-*.sql.gz "$evidence"
ls ~/Backups/currentfold-cutover/   # on the laptop — the off-VPS copy from step 5.2
```

Retain until day 14: the final dump (both copies), the whole `$evidence` directory, the
stopped `rssapp` project and its volumes, and the `ghcr.io/tommyri/rssapp` package.

### 7.9 Day-14 cleanup — **[several]**

Run this **on or after cutover date + 14 days**, and only if the reader has been healthy
throughout. If the cutover ran on 2026-08-06, the date is **2026-08-20**. Derive it:

```bash
date -u -d '+14 days' +%F        # VPS / GNU date
date -u -v+14d +%F               # macOS
```

Everything below is irreversible. Work down the list in order.

**[VPS shell]** Remove the old Compose project, its volumes, and its paths:

```bash
"${old[@]}" down
docker volume rm rssapp_db-data rssapp_backup-data
rm -rf /opt/rssapp
rm -f /etc/rssapp/production.env /etc/rssapp/staging.env
rmdir /etc/rssapp
rm -rf /var/backups/rssapp        # only after confirming the laptop copy of final-*.sql.gz exists
```

Deleting `/etc/rssapp/production.env` is **not** a rotation. `AUTH_GOOGLE_SECRET` was
copied into the new environment file in step 4.5 and is still live. The old `AUTH_SECRET`
and the old Postgres password die with the volume; nothing else does.

**[VPS shell]** Remove the old images so the disk reflects reality:

```bash
docker image ls 'ghcr.io/tommyri/rssapp'
docker image rm $(docker image ls -q 'ghcr.io/tommyri/rssapp')
```

**[VPS shell]** Drop the pre-cutover evidence **last**, after everything above has
succeeded — section 8 is dead without it:

```bash
evidence="/root/cutover-<the date from step 2.1>"
rm -rf "$evidence"
```

**[wherever `badask.no` DNS is hosted]** Delete the `rssapp.badask.no` A record.

**[Google Cloud Console]** **Clients** → the Web application client → remove the
`https://rssapp.badask.no/api/auth/callback/google` redirect URI.

**[Resend dashboard]** Revoke the pre-cutover API key. If a `badask.no` sending domain is
registered there, remove it.

**[GitHub UI / local shell]** Delete the obsolete container package. This cannot be undone
and takes every historical `rssapp` image tag with it:

```bash
gh api --method DELETE /user/packages/container/rssapp
```

Keep the Git history, the existing `v…` release tags, and the GitHub Releases. They are
historical evidence, not compatibility contracts, and the plan is explicit that history is
not rewritten.

### 7.10 Fold the result into steady state — **[local shell]**

Update `docs/deployment.md` so it describes the world that now exists: `tommyri/currentfold`,
`ghcr.io/tommyri/currentfold`, `/opt/currentfold`, `/etc/currentfold/*.env`,
`/var/backups/currentfold`, `APP_PORT=3100` production and `3101` reserved for staging,
`https://app.currentfold.com` in every example URL, and the Cloudflare-in-front facts from
step 4.7. Then mark Phase 4 complete in `docs/brand-domain-migration.md` and record the
validation results and dates below.

---

## 8. Rollback

Use this only for a critical failure during or shortly after cutover, while the old stack
is still stopped-but-present. It is an emergency restoration of the previous world, not a
compatibility mode.

In a fresh root shell, re-create the two Compose arrays from
[Before you start](#before-you-start) and re-point `evidence` at the directory step 2.1
created:

```bash
evidence="/root/cutover-<the date from step 2.1>"
ls "$evidence"
```

### 8.1 Stop the new application — **[VPS shell]**

```bash
"${new[@]}" stop app
```

Stop the app, not the project. Leaving `currentfold-db-1` running preserves everything
written on the new origin in case the failure turns out to be recoverable forward.

### 8.2 Restore the old proxy configuration — **[VPS shell]**

```bash
cp -a "$evidence/Caddyfile.pre-cutover" /etc/caddy/Caddyfile
caddy validate --adapter caddyfile --config /etc/caddy/Caddyfile
systemctl reload caddy
```

This file predates every change in this runbook, so it also removes the
`app.currentfold.com` site and the global `trusted_proxies` block — which is what you want.
`app.currentfold.com` will then fail its handshake through Cloudflare (525). Pause the
Cloudflare proxy on the `app` record, or delete the record, so the failure is quiet rather
than a bare error page.

### 8.3 Restart the old application — **[VPS shell]**

```bash
"${old[@]}" up -d --wait app
"${old[@]}" ps
curl -fsS https://rssapp.badask.no/api/health | jq .
```

The health response must match `$evidence/old-health.json` — same version, same revision.
No image argument is needed: the volume, the environment file and the image are all
untouched.

If the old database volume itself is damaged, restore the final dump into it instead of
restarting blind. That is an incident operation: preserve the current state first, then
restore, then start the app.

### 8.4 Boundary rules

From the plan's rollback section, and they are not negotiable:

- **Do not copy data written on the new stack back into the old database.** The old
  database is authoritative as of the final dump in step 5.2. Anything read, saved or
  highlighted on `app.currentfold.com` after cutover is discarded by a rollback. If some of
  it matters, that is a separate recovery decision made deliberately, not a `pg_dump` run
  in a hurry.
- **Never point both app containers at one database.** Two schedulers polling the same
  feeds and two migration runners racing at boot is a worse failure than the one you are
  rolling back from.
- **Do not `git pull` in `/opt/rssapp`.** The rollback path depends on that checkout still
  holding the pre-rename Compose files and deploy script.
- **Do not delete the `rssapp` volumes, `/var/backups/rssapp`, or the `rssapp` GHCR package
  before day 14**, whatever the disk usage graph says.

---

## Record sheet

Fill this in as you go; it is what Phase 4 item 4 asks the runbook to carry forward.

| Fact | Value |
| --- | --- |
| Cutover date (UTC) | |
| Deployed commit | |
| Deployed image | `ghcr.io/tommyri/currentfold:sha-…` |
| Health `version` / `shortRevision` after cutover | |
| Final old dump (VPS path) | `/var/backups/rssapp/final-….sql.gz` |
| Final old dump (off-VPS copy) | `~/Backups/currentfold-cutover/…` |
| Row-count diff clean? | |
| Visitor IP verified through Cloudflare? | |
| AASA `appID` verified? | |
| iOS device build + share extension verified? | |
| Resend `send.currentfold.com` verified on | |
| Google callback added on | |
| Old Caddy host removed on | |
| Old stack stopped on | |
| Day-14 cleanup due | cutover date + 14 days |
| Day-14 cleanup completed on | |

### Key and certificate ledger

| Secret / certificate | Created | Next action | Due |
| --- | --- | --- | --- |
| Origin CA certificate `app.currentfold.com` | cutover date | Reissue (repeat steps 3.5–3.6) | cutover date + 5 years |
| `AUTH_SECRET` | cutover date | Review / rotate | cutover date + 1 year |
| `POSTGRES_PASSWORD` (currentfold) | cutover date | Rotate with an intentional `psql` password change plus a matching `DATABASE_URL` edit | as needed |
| VAPID pair | cutover date | Rotate only with a deliberate re-subscribe; rotating invalidates every push subscription | — |
| Resend production API key | step 7.4 | Rotate | cutover date + 1 year |
| `AUTH_GOOGLE_SECRET` | predates the cutover | Rotate — it survived the identity change | soon after cutover |
| GHCR `read:packages` token | predates the cutover | Note the existing expiry and set a calendar reminder before it | check in GitHub |

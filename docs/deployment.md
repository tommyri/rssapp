# Deployment runbook

This is the operational reference for rssapp. Follow it for the first VPS setup,
routine staging and production deployments, releases, and recovery. The VPS **never**
builds application source: GitHub Actions tests `main` and publishes Linux images to
GitHub Container Registry (GHCR); the VPS pulls a selected image and runs it with Docker
Compose.

## The deployment model

| Environment | Image | Update policy | Data |
|---|---|---|---|
| Local | Working-tree build | Manual | Local Docker volumes |
| Staging | `ghcr.io/tommyri/rssapp:edge` | Checks every five minutes | Separate `rssapp-staging` volumes and database |
| Production | `ghcr.io/tommyri/rssapp:sha-<commit>` or a calendar-version tag | Explicit promotion only | Existing `rssapp` volumes and database |

The `edge` tag changes whenever a verified commit reaches `main`; it is deliberately
staging-only. A production deployment always names an immutable commit SHA or release
version that has already been tested on staging.

Keep staging and production separate: different domains, environment files, Compose
project names, databases, backup locations, email senders where practical, and VAPID
keys. Browser-push subscriptions belong to an HTTPS origin, so staging cannot validate a
production subscription.

## 1. One-time GitHub setup

The workflows in `.github/workflows/` use GitHub's short-lived `GITHUB_TOKEN` to publish
images and create releases. **Do not create a GitHub secret for CI.**

1. Open the repository on GitHub: **Settings → Actions → General**.
2. Ensure GitHub Actions is enabled.
3. Under **Workflow permissions**, select **Read and write permissions**, then save.
4. Commit and push the workflow files to `main`.
5. Open the **Actions** tab and wait for **CI and publish staging image** to succeed.

That first successful `main` run publishes both `ghcr.io/tommyri/rssapp:edge` and the
immutable `ghcr.io/tommyri/rssapp:sha-<full-commit-sha>` image. The Container package is
private by default; that is expected for this private repository.

## 2. Prepare the VPS

### Prerequisites

- Docker Engine and the Docker Compose v2 plugin are installed and working.
- A reverse proxy terminates HTTPS for a production domain and, if used, a separate
  staging domain. Caddy or Nginx are both fine.
- The reverse proxy runs on the VPS host. The supplied Compose override binds only to
  `127.0.0.1`; Postgres is never published to the host network.

For a first installation, create a clean, ordinary Git checkout containing only the
deployment configuration and scripts. The application container itself will come from
GHCR.

```bash
sudo install -d -m 755 /opt
git clone git@github.com:tommyri/rssapp.git /tmp/rssapp
sudo mv /tmp/rssapp /opt/rssapp
```

If `/opt/rssapp` already exists, keep it as a clean checkout. Do not make server-specific
edits to `compose.yaml`: private configuration belongs in `/etc/rssapp/*.env`. Before
adopting this setup, save and review any existing local diff, move the intended values
into the environment file, then make the checkout clean. Routine image deployments never
run `git pull`; update this checkout deliberately with `git -C /opt/rssapp pull --ff-only`
only when deployment configuration or scripts change.

Create the protected configuration and backup directories:

```bash
sudo install -d -m 700 /etc/rssapp /var/backups/rssapp
sudo install -m 600 /dev/null /etc/rssapp/staging.env
sudo install -m 600 /dev/null /etc/rssapp/production.env
```

### Reverse proxy and ports

Production uses `APP_PORT=3000`; staging uses `APP_PORT=3001`, so both can coexist on one
VPS. Point each HTTPS hostname at its loopback port. For example, a host-installed Caddy
configuration can be:

```caddyfile
rss.example.com {
  reverse_proxy 127.0.0.1:3000
}

staging.rss.example.com {
  reverse_proxy 127.0.0.1:3001
}
```

Use the equivalent upstreams if you run Nginx. Do not expose port 5432, and do not change
the app mapping to a public interface. HTTPS is required for browser push outside local
development.

## 3. Give the VPS read-only GHCR access

GHCR package authentication currently uses a **personal access token (classic)**. Create
a dedicated token with only the ability to download package images:

1. On GitHub, open **profile picture → Settings → Developer settings → Personal access
   tokens → Tokens (classic) → Generate new token (classic)**.
2. Give it a descriptive note such as `rssapp VPS GHCR pull`.
3. Choose an expiration that you will actively rotate (for example, one year), and add a
   calendar reminder before that date. A token that expires causes staging pulls and
   production deployments to fail until it is replaced.
4. Select **only** the `read:packages` scope. Do not add `repo`, `write:packages`, or
   `delete:packages`.
5. Generate the token and copy it immediately; GitHub will not show it again. If GitHub
   requires SSO authorization for the account or organization, authorize the token there.

The GitHub account that creates the token must itself be allowed to read this private
repository/package. The token is only for the VPS Docker daemon—it is not an application
secret and must not go in either rssapp environment file.

Log in once on the VPS as the same account that will run deployments. `sudo docker` stores
the registry credential for root, which is correct because the deployment script also runs
as root. The token is entered without echoing and is passed over standard input, so it
does not appear in shell history or the process command line.

```bash
read -rsp 'Paste GHCR token: ' GHCR_TOKEN; echo
printf '%s' "$GHCR_TOKEN" | sudo docker login ghcr.io -u tommyri --password-stdin
unset GHCR_TOKEN

# Run after the first main workflow has published an image.
sudo docker pull ghcr.io/tommyri/rssapp:edge
```

`Login Succeeded` confirms that Docker saved the credential in root's protected Docker
configuration. Do not copy that credential into `/etc/rssapp/*.env`, the repository, a
shell profile, or a systemd unit.

### Rotate or revoke the token

Before the token expires, create a replacement with the same `read:packages` scope, then
repeat the login command above. Test it with `sudo docker pull …:edge`, revoke the old
token in GitHub, and finally run `sudo docker logout ghcr.io` only if you need to remove
the credential altogether. A logged-out VPS cannot deploy private images.

GitHub's current registry requirements and `--password-stdin` login pattern are described
in the official [Container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry).

## 4. Configure each environment

Edit the root-readable files with `sudoedit`; never put real secrets in `.env.example` or
commit them. The passwords below should be distinct, randomly generated values. Hex
passwords avoid URL-encoding surprises in `DATABASE_URL`:

```bash
openssl rand -hex 24      # Safe value for POSTGRES_PASSWORD
openssl rand -base64 48   # Safe value for AUTH_SECRET
```

Create `/etc/rssapp/staging.env` with values like these (replace every example secret):

```dotenv
APP_IMAGE=ghcr.io/tommyri/rssapp:edge
APP_PORT=3001
POSTGRES_USER=rssapp_staging
POSTGRES_PASSWORD=<different-random-hex-password>
POSTGRES_DB=rssapp_staging
DATABASE_URL=postgres://rssapp_staging:<same-password>@db:5432/rssapp_staging
AUTH_SECRET=<different-long-random-secret>
APP_URL=https://staging.rss.example.com

SCHEDULER_TICK_MS=60000
BACKUP_INTERVAL_HOURS=24
BACKUP_RETENTION=14

# Fill only when this environment uses the integration.
RESEND_API_KEY=
EMAIL_FROM=
AUTH_GOOGLE_ID=
AUTH_GOOGLE_SECRET=
APPLE_NATIVE_CLIENT_ID=
APPLE_TEAM_ID=
VAPID_SUBJECT=mailto:admin@example.com
VAPID_PUBLIC_KEY=
VAPID_PRIVATE_KEY=
```

Create `/etc/rssapp/production.env` with the same fields but:

```dotenv
APP_IMAGE=ghcr.io/tommyri/rssapp:sha-<tested-commit>
APP_PORT=3000
POSTGRES_USER=<existing-or-production-only-user>
POSTGRES_PASSWORD=<production-password>
POSTGRES_DB=<existing-or-production-only-database>
DATABASE_URL=postgres://<same-user>:<same-password>@db:5432/<same-database>
AUTH_SECRET=<production-secret>
APP_URL=https://rss.example.com
```

For an existing production database, preserve its actual Postgres user, password, and
database name in this first file. Changing `POSTGRES_PASSWORD` in Compose does **not**
change the password inside an initialized Postgres volume. Rotate it later with an
intentional `psql` password change, update `DATABASE_URL` at the same time, and restart
the app.

Generate VAPID keys separately per HTTPS origin if browser push is enabled:

```bash
npx web-push generate-vapid-keys --json
```

Use the resulting subject, public key, and private key in that environment's file. Do not
share staging keys with production.

### Optional native iOS Apple integration

This integration is intentionally disabled until the paid Apple membership and the full
[Sign in with Apple production-readiness checklist](sign-in-with-apple.md) are complete.
Do not expose the provider merely by setting its environment variables: the Apple token
revocation lifecycle, private email relay, signed build, and real-device validation are
part of the activation gate.

Currentfold's verification and password-reset links work as ordinary HTTPS pages with no
Apple configuration. To open those same links directly in the installed iOS app, set
`APPLE_TEAM_ID` to the 10-character Team ID shown in the Apple Developer account. The
service then publishes `/.well-known/apple-app-site-association` for the
`no.currentfold.reader` bundle identifier. The iOS build's
`CURRENTFOLD_ASSOCIATED_DOMAIN` must match the hostname in `APP_URL`; change it in
`apps/ios/project.yml`, regenerate the Xcode project, and sign with an App ID that has
the Associated Domains capability.

To also enable **Sign in with Apple**, enable that capability for the same App ID and
set the server audience to the native bundle identifier:

```dotenv
APPLE_NATIVE_CLIENT_ID=no.currentfold.reader
```

After redeploying, `GET /api/v1/auth/providers` should report `"apple": true`. The
native client fetches a one-time server challenge before presenting Apple's system
authorization sheet. The server checks Apple's signature, issuer, audience, expiry,
verified email, and nonce before issuing a Currentfold device session. No Apple client
secret is shipped in the app. Before App Store distribution, complete the separately
tracked deletion-time Apple authorization revocation flow.

Verify the deployment before distributing a build:

```bash
curl -i https://rss.example.com/.well-known/apple-app-site-association
```

Expect `200`, `Content-Type: application/json`, and an `appID` beginning with the Apple
Team ID. A `404` means `APPLE_TEAM_ID` is absent or malformed. Do not add redirects to
this well-known route; Apple must receive the JSON document directly over HTTPS.

### Optional Google sign-in

Google sign-in is optional. The web app only enables its Google buttons when **both**
`AUTH_GOOGLE_ID` and `AUTH_GOOGLE_SECRET` are present. It uses Google for identity only;
no Google API needs to be enabled for this feature.

1. In [Google Cloud Console](https://console.cloud.google.com/), create or select a
   project, then open **Google Auth Platform**. Complete the branding and audience setup:
   use **External** for ordinary Google accounts (or **Internal** only when every reader
   belongs to the same Google Workspace organization). While the app is in testing, add
   each allowed Google account as a test user.
2. Open **Clients**, choose **Create client**, and select **Web application**. Do not use
   a desktop, Android, or JavaScript client.
3. Add this exact authorized redirect URI for production, replacing the hostname with the
   canonical `APP_URL` hostname:

   ```text
   https://rss.example.com/api/auth/callback/google
   ```

   The scheme, hostname, path, and trailing slash behavior must match exactly. The
   server-side flow does not need an authorized JavaScript origin. For local development,
   add `http://localhost:3000/api/auth/callback/google` to a development-only client.
   Create a separate OAuth client for staging and add its staging callback there; do not
   put production and staging credentials in the same environment file.
4. Copy the generated client ID and client secret immediately—Google only displays the
   secret once—and add them to the relevant protected environment file:

   ```dotenv
   AUTH_GOOGLE_ID=<client-id>.apps.googleusercontent.com
   AUTH_GOOGLE_SECRET=<client-secret>
   ```

   Never expose the secret through a `NEXT_PUBLIC_` variable, source control, browser
   code, or a screenshot. After editing the environment file, redeploy the same selected
   production image so the server receives the new values.

   ```bash
   sudo bash /opt/rssapp/scripts/deploy-image.sh production
   ```

5. Visit `/login` or `/signup` on the matching HTTPS domain and select **Continue with
   Google**. A `redirect_uri_mismatch` error means the URI in Google Cloud does not exactly
   equal `https://<APP_URL-host>/api/auth/callback/google`.

For native iOS Google sign-in, keep that Web application client as the token's server
audience and create one additional **iOS** client for bundle ID
`no.currentfold.reader`. Configure these public build settings in
`apps/ios/project.yml` (or as Xcode build overrides), then run
`npm run ios:generate`:

```yaml
CURRENTFOLD_GOOGLE_CLIENT_ID: <iOS client ID>
CURRENTFOLD_GOOGLE_REVERSED_CLIENT_ID: <reversed iOS client ID>
CURRENTFOLD_GOOGLE_SERVER_CLIENT_ID: <same value as AUTH_GOOGLE_ID>
```

The client secret remains server-only. The iOS Google button appears only when the
server has `AUTH_GOOGLE_ID` and all client build settings are present. Confirm server
discovery with:

```bash
curl https://rss.example.com/api/v1/auth/providers
```

Google identities are keyed by Google's stable account subject, never merely a matching
email address. Someone who already has a password account must sign in normally and link
Google from account settings; the app will not silently merge accounts.

## 5. First deployment and checks

The deploy script starts the database if needed, creates a pre-deploy SQL backup for
production, pulls the app image, applies normal boot migrations, and waits for the
database-backed `/api/health` endpoint. It only replaces the app container: it never runs
`docker compose down`, deletes volumes, rebuilds source on the VPS, or recreates
Postgres.

```bash
# Staging reads APP_IMAGE=edge from /etc/rssapp/staging.env.
sudo bash /opt/rssapp/scripts/deploy-image.sh staging

# Promote an immutable image that has been tested on staging.
sudo bash /opt/rssapp/scripts/deploy-image.sh production \
  ghcr.io/tommyri/rssapp:sha-<tested-full-commit-sha>
```

After either deployment, confirm the healthy HTTPS endpoint and inspect the relevant
container if it failed:

```bash
curl --fail --show-error https://staging.rss.example.com/api/health
sudo docker logs --tail=200 rssapp-staging-app-1

curl --fail --show-error https://rss.example.com/api/health
sudo docker logs --tail=200 rssapp-app-1
```

The health response contains `status: "ok"`, the calendar `version`, the full source
`revision`, and its `shortRevision`. The same version and short revision appear at the
bottom of Settings and in the image's OCI metadata. Readiness failures return 503 but
retain this non-sensitive identity, which helps distinguish a broken deployment from an
old one. These values are baked into the image by GitHub Actions; do not add them to the
VPS environment file. Container names can vary with the Docker Compose version; if a
name differs, use
`sudo docker compose --project-name rssapp-staging ps` or `--project-name rssapp ps` to
find it.

## 6. Let staging follow `main`

Install the systemd unit and timer once. It pulls the current `edge` image every five
minutes; ordinary runs are safe no-ops when the image did not change.

```bash
sudo cp /opt/rssapp/deploy/systemd/rssapp-staging.{service,timer} /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now rssapp-staging.timer
sudo systemctl list-timers rssapp-staging.timer
```

Useful staging diagnostics:

```bash
sudo systemctl status rssapp-staging.timer
sudo journalctl -u rssapp-staging.service -n 100 --no-pager
sudo bash /opt/rssapp/scripts/deploy-image.sh staging  # Run one update immediately.
```

There is intentionally **no production timer**. Production only changes when a person
selects a tested immutable image.

## 7. Routine development and promotion

1. Push a commit to `main`.
2. Wait for the GitHub **CI and publish staging image** workflow to pass. It runs lint,
   tests, and build before publishing `edge` and the commit's `sha-…` image.
3. Let the staging timer deploy `edge` (or run the staging command manually), then test
   it at the staging domain.
4. Promote the exact tested commit—use the full Git SHA shown by GitHub—to production:

   ```bash
   sudo bash /opt/rssapp/scripts/deploy-image.sh production \
     ghcr.io/tommyri/rssapp:sha-<tested-full-commit-sha>
   ```

5. Test the production health endpoint and the user-facing change.

This keeps production independent of the mutable `edge` tag and avoids the old failure
mode where a VPS checkout with a local Compose modification blocks `git pull`.

## 8. Calendar releases and GitHub Releases

Product milestones can span multiple releases, but each shipped build uses calendar
versioning: `YYYY.M.N` — year, month, then the release number in that month. The first
two July 2026 releases are `2026.7.1` and `2026.7.2`; the next is `2026.7.3`. No zero
padding is used, keeping the version valid npm semver as well as readable calendar
versioning.

`CHANGELOG.md` is the release source of truth. The release workflow copies the matching
section into the GitHub Release and promotes the already-tested commit image to both
`:<version>` and `:v<version>` in GHCR.

```bash
# 1. Freeze the candidate: version metadata and move Unreleased notes.
npm run release:prepare -- 2026.7.1
git add package.json package-lock.json CHANGELOG.md
git commit -m "release: prepare 2026.7.1"
git push origin main

# 2. Wait for CI to publish that exact commit and test it in staging.
# 3. Tag the same tested commit. Do not use --follow-tags with the main push:
#    the release workflow needs the immutable sha image to exist first.
git tag -a v2026.7.1 -m "rssapp 2026.7.1"
git push origin v2026.7.1

# 4. After the GitHub Release appears, promote the immutable release tag.
sudo bash /opt/rssapp/scripts/deploy-image.sh production \
  ghcr.io/tommyri/rssapp:2026.7.1
```

If staging finds a defect after preparing a candidate, fix it on `main`, add the
user-visible note under `Unreleased`, and prepare the next calendar version. Never move
an existing release tag to a different commit.

## 9. Backups, rollback, and recovery boundaries

Every production deploy writes a timestamped `pg_dump` SQL backup to
`/var/backups/rssapp` before the app image changes. Keep copies of those files off the
VPS as well as the app's scheduled JSON snapshots. Periodically test that the SQL backup
can be restored into a disposable database; an untested backup is only a hope.

To roll back application code, deploy the last known-good immutable SHA or calendar tag:

```bash
sudo bash /opt/rssapp/scripts/deploy-image.sh production \
  ghcr.io/tommyri/rssapp:sha-<last-known-good-full-commit-sha>
```

Do **not** blindly roll back database migrations. A database restore is an incident
operation: first preserve the current state, stop the app, decide whether the target
database must be replaced, and restore only a backup known to match the intended app
version. Verify that procedure in a disposable environment before relying on it for
production.

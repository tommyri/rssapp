#!/usr/bin/env bash
# Pull and activate a pre-built GHCR image. This script never checks out source
# code and never builds on the VPS, so a deployment is reproducible from its
# image tag or digest.
set -euo pipefail

usage() {
  cat <<'EOF'
Usage: scripts/deploy-image.sh <staging|production> [image]

The selected environment file must exist at /etc/rssapp/<environment>.env by
default. Set RSSAPP_CONFIG_DIR to use another directory. Passing an image
temporarily overrides APP_IMAGE from that file; use this to promote a tested
immutable sha-<commit> image to production.
EOF
}

environment="${1:-}"
if [[ "$environment" != "staging" && "$environment" != "production" ]]; then
  usage >&2
  exit 64
fi

if [[ $# -gt 2 ]]; then
  usage >&2
  exit 64
fi

if [[ $# -eq 2 ]]; then
  export APP_IMAGE="$2"
fi

repo_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
config_dir="${RSSAPP_CONFIG_DIR:-/etc/rssapp}"
env_file="${config_dir}/${environment}.env"
project_name="rssapp"
if [[ "$environment" == "staging" ]]; then
  project_name="rssapp-staging"
fi

if [[ ! -r "$env_file" ]]; then
  echo "Missing environment file: $env_file" >&2
  exit 78
fi

compose=(
  docker compose
  --project-directory "$repo_dir"
  --project-name "$project_name"
  --env-file "$env_file"
  -f "$repo_dir/compose.yaml"
  -f "$repo_dir/compose.vps.yaml"
)

# Make the initial install safe as well as ordinary app-only upgrades.
"${compose[@]}" up -d --wait db

if [[ "$environment" == "production" ]]; then
  backup_dir="${RSSAPP_DEPLOY_BACKUP_DIR:-/var/backups/rssapp}"
  mkdir -p "$backup_dir"
  backup_path="$backup_dir/predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  temp_path="${backup_path}.tmp"

  echo "Creating pre-deploy database backup at $backup_path"
  "${compose[@]}" exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB"' \
    | gzip -c >"$temp_path"
  mv "$temp_path" "$backup_path"
fi

"${compose[@]}" pull app
"${compose[@]}" up -d --no-deps --wait app
"${compose[@]}" ps app

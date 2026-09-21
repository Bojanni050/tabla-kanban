#!/usr/bin/env bash
#
# Back up the Kala PostgreSQL database (docker compose stack).
#
#   bash scripts/backup-db.sh
#
# Creates  <BACKUP_DIR>/kala-YYYYmmdd-HHMMSS.dump  (pg_dump custom format), checks that the
# dump is readable, and keeps only the newest KEEP backups. Safe to run from cron: it prints
# one line per step, exits non-zero on any failure, and never leaves a half-written dump
# behind. It only reads from the database; the running application is not affected.
#
# Settings (environment variables, all optional):
#   BACKUP_DIR   where dumps are stored          (default: <project>/backups, git-ignored)
#   KEEP         how many backups to keep        (default: 14)
#
# Restore: see "Back up PostgreSQL" in the README (pg_restore --clean --if-exists).
# A backup on the same server does not protect against losing the server - copy the dumps
# somewhere else too (rsync/scp/object storage).

set -Eeuo pipefail

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-$PROJECT_DIR/backups}"
KEEP="${KEEP:-14}"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*"; }
die() { log "ERROR: $*" >&2; exit 1; }

[[ "$KEEP" =~ ^[1-9][0-9]*$ ]] || die "KEEP must be a positive integer (got '$KEEP')"
command -v docker >/dev/null 2>&1 || die "docker is not installed or not in PATH"
docker compose version >/dev/null 2>&1 || die "the 'docker compose' plugin is not available"
docker info >/dev/null 2>&1 || die "cannot reach the Docker daemon (is Docker running, and may this user use it?)"

cd "$PROJECT_DIR"
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"

# Only one backup at a time (skipped where flock is unavailable).
if command -v flock >/dev/null 2>&1; then
  exec 9>"$BACKUP_DIR/.backup.lock"
  flock -n 9 || die "another backup is already running"
fi

# The database container must be up and healthy.
container="$(docker compose ps -q postgres 2>/dev/null || true)"
[[ -n "$container" ]] || die "postgres container not found - is the stack running? (docker compose up -d)"
health="$(docker inspect -f '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container")"
[[ "$health" == "healthy" || "$health" == "running" ]] || die "postgres is not healthy (state: $health)"

stamp="$(date +%Y%m%d-%H%M%S)"
partial="$BACKUP_DIR/.kala-$stamp.dump.partial"
final="$BACKUP_DIR/kala-$stamp.dump"
trap 'rm -f "$partial"' EXIT

# Stream the dump straight out of the container (credentials come from the container's own
# POSTGRES_* variables, so nothing secret is needed here).
log "Dumping database ..."
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > "$partial"

# A dump that is empty or cut off is worse than none: verify it before keeping it.
[[ -s "$partial" ]] || die "the dump is empty"
tables="$(docker compose exec -T postgres pg_restore --list < "$partial" | grep -c ' TABLE ' || true)"
[[ "$tables" -gt 0 ]] || die "the dump could not be read back (no tables found)"

mv "$partial" "$final"
chmod 600 "$final"
size="$(du -h "$final" | cut -f1)"
log "Backup written: $final ($size, $tables tables)"

# Keep only the newest $KEEP backups.
removed=0
while IFS= read -r old; do
  rm -f -- "$old"
  removed=$((removed + 1))
done < <(ls -1t "$BACKUP_DIR"/kala-*.dump 2>/dev/null | tail -n +"$((KEEP + 1))")
count="$(ls -1 "$BACKUP_DIR"/kala-*.dump 2>/dev/null | wc -l | tr -d ' ')"
log "Retention: keeping $count backup(s), removed $removed old one(s) (KEEP=$KEEP)"

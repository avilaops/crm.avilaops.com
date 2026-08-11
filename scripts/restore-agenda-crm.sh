#!/usr/bin/env sh
set -eu

if [ "${1:-}" = "" ]; then
  echo "usage: restore-agenda-crm.sh /path/agenda-crm-backup.sql.gz" >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-/opt/agenda-crm/current/docker-compose.production.yml}"
PROJECT_DIR="${PROJECT_DIR:-/opt/agenda-crm/current}"
BACKUP_FILE="$1"

cd "$PROJECT_DIR"
gzip -dc "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T db psql -U agenda_crm agenda_crm

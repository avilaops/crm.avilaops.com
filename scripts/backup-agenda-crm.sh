#!/usr/bin/env sh
set -eu

BACKUP_DIR="${BACKUP_DIR:-/opt/agenda-crm/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/agenda-crm/current/docker-compose.production.yml}"
PROJECT_DIR="${PROJECT_DIR:-/opt/agenda-crm/current}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"
docker compose -f "$COMPOSE_FILE" exec -T db pg_dump -U agenda_crm agenda_crm | gzip > "$BACKUP_DIR/agenda-crm-$STAMP.sql.gz"
find "$BACKUP_DIR" -name 'agenda-crm-*.sql.gz' -mtime +14 -delete

#!/usr/bin/env bash
#
# Restaura um dump do Agenda CRM por cima do banco de produção.
#
# Uso: restore-agenda-crm.sh /opt/agenda-crm/backups/agenda-crm-AAAAMMDDTHHMMSSZ.sql.gz
#
# O que este script fazia de errado até 01/09/2026: chamava o psql sem
# `ON_ERROR_STOP`. Restaurando por cima de um banco que ainda tinha as tabelas,
# o psql cuspia 132 erros ("relation already exists", "duplicate key"), pulava
# todos os COPY e **terminava com código 0**. No teste, um banco a que faltavam
# 4.000 contatos continuou faltando os 4.000 depois do restore dito "bem
# sucedido" — o pior comportamento possível para uma ferramenta de desastre.
#
# Agora: erro para tudo (`ON_ERROR_STOP=1`) e a restauração inteira roda em uma
# transação, então ou o banco volta inteiro ou não é tocado.
#
# Dumps anteriores a 01/09/2026 foram feitos sem `--clean` e só restauram em
# banco vazio; com este script eles falham alto em vez de fingir sucesso.
set -euo pipefail

if [ "${1:-}" = "" ]; then
  echo "uso: restore-agenda-crm.sh /caminho/agenda-crm-backup.sql.gz" >&2
  exit 1
fi

COMPOSE_FILE="${COMPOSE_FILE:-/opt/agenda-crm/current/docker-compose.production.yml}"
PROJECT_DIR="${PROJECT_DIR:-/opt/agenda-crm/current}"
BACKUP_FILE="$1"

[ -f "$BACKUP_FILE" ] || { echo "! arquivo não encontrado: $BACKUP_FILE" >&2; exit 1; }
gzip -t "$BACKUP_FILE" || { echo "! gzip corrompido: $BACKUP_FILE" >&2; exit 1; }

cd "$PROJECT_DIR"

echo "▸ restaurando $BACKUP_FILE"
gzip -dc "$BACKUP_FILE" | docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U agenda_crm -v ON_ERROR_STOP=1 --single-transaction agenda_crm

echo "▸ conferindo"
docker compose -f "$COMPOSE_FILE" exec -T db \
  psql -U agenda_crm -d agenda_crm -At -c \
  "select 'contatos: ' || count(*) from contacts"
echo "· restaurado"

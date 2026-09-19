#!/usr/bin/env bash
#
# Dump diário do banco do Agenda CRM. Roda pelo /etc/cron.d/agenda-crm-backup.
#
# Duas lições aprendidas testando o script em 01/09/2026:
#
# 1. `pg_dump | gzip` engole a falha do pg_dump. Quem define o código de saída
#    do pipeline é o gzip, que termina feliz mesmo sem receber nada: um dump
#    quebrado virava um .gz de 20 bytes que passa no `gzip -t`, e o
#    `find -delete` ia comendo os backups bons até sobrar só o lixo. Por isso
#    bash com `pipefail` (o dash do servidor até suporta, mas não é garantido)
#    e escrita em arquivo temporário, promovido só depois que o dump termina.
#
# 2. Sem `--clean`, o dump só restaura em banco vazio. Por cima de um banco que
#    ainda tem as tabelas dava 132 erros e recuperava zero linha — que é
#    exatamente o cenário de um desastre real.
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/opt/agenda-crm/backups}"
COMPOSE_FILE="${COMPOSE_FILE:-/opt/agenda-crm/current/docker-compose.production.yml}"
PROJECT_DIR="${PROJECT_DIR:-/opt/agenda-crm/current}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
DESTINO="$BACKUP_DIR/agenda-crm-$STAMP.sql.gz"

mkdir -p "$BACKUP_DIR"
cd "$PROJECT_DIR"

# Escreve em .parcial: se o dump morrer no meio, o arquivo não tem nome de
# backup bom e o `find` da limpeza não o confunde com um.
PARCIAL="$DESTINO.parcial"
trap 'rm -f "$PARCIAL"' EXIT

docker compose -f "$COMPOSE_FILE" exec -T db \
  pg_dump -U agenda_crm --clean --if-exists agenda_crm | gzip > "$PARCIAL"

# Um dump do CRM tem centenas de KB. Qualquer coisa abaixo de 10 KB é sintoma
# de dump vazio, não de banco pequeno.
TAMANHO=$(stat -c%s "$PARCIAL")
if [ "$TAMANHO" -lt 10240 ]; then
  echo "! dump de apenas $TAMANHO bytes — suspeito. Backup descartado." >&2
  exit 1
fi

mv "$PARCIAL" "$DESTINO"
trap - EXIT
echo "· backup em $DESTINO ($(du -h "$DESTINO" | cut -f1))"

# A limpeza só roda depois de um backup bom entrar no lugar.
find "$BACKUP_DIR" -name 'agenda-crm-*.sql.gz' -mtime +14 -delete

#!/usr/bin/env bash
# Deploy do Agenda CRM no Hetzner.
#
# A imagem vem pronta do ghcr.io (publicada pelo .github/workflows/imagem.yml
# a cada push na main). Aqui só puxamos e subimos — o servidor tem 2 vCPU e
# ~1 GB livre, e buildar Vite + TS aqui competia por RAM com o Postgres e com
# o worker de IA. Um build que estoura derruba o CRM; um `pull` não.
#
# Rodar no servidor, de dentro de /opt/agenda-crm/current.
set -euo pipefail

COMPOSE="docker compose --env-file .env.production.local -f docker-compose.production.yml"

echo "=== Deploy do Agenda CRM ==="

if [ ! -f .env.production.local ]; then
  echo "! Falta .env.production.local — ele guarda os segredos e não é versionado."
  exit 1
fi

echo "· espaço: $(df -h /var/lib/docker --output=pcent | tail -1 | tr -d ' ') usado"
echo "· memória livre: $(free -m | awk '/^Mem:/{print $7}') MB"

# Guarda a imagem atual: se a nova subir quebrada, dá para voltar em segundos.
ANTERIOR=$(docker inspect --format '{{.Image}}' agenda-crm-app 2>/dev/null || echo "")
[ -n "$ANTERIOR" ] && echo "· imagem atual: ${ANTERIOR:7:19}"

echo "▸ puxando a imagem do ghcr.io"
$COMPOSE pull app

echo "▸ subindo"
$COMPOSE up -d app

echo "▸ migrações"
sleep 5
$COMPOSE exec -T app npm run db:migrate

echo "▸ conferindo saúde"
for i in $(seq 1 20); do
  if curl -sf http://127.0.0.1:3020/ >/dev/null 2>&1; then
    echo "· no ar"
    $COMPOSE ps
    docker image prune -f >/dev/null
    exit 0
  fi
  sleep 3
done

echo "! não respondeu em 60s. Últimos logs:"
$COMPOSE logs --tail 40 app
if [ -n "$ANTERIOR" ]; then
  echo
  echo "Para voltar à imagem anterior:"
  echo "  docker tag $ANTERIOR ghcr.io/avilaops/crm.avilaops.com:latest && $COMPOSE up -d app"
fi
exit 1

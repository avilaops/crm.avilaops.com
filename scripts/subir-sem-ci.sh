#!/usr/bin/env bash
#
# Deploy do Agenda CRM sem passar pelo GitHub Actions.
#
# Por que existe
# -------------
# O `deploy.sh` puxa a imagem do ghcr.io publicada pelo workflow a cada push na
# main. A conta da organização está bloqueada por cobrança e todo run volta
# `startup_failure`, então essa imagem parou no tempo. Buildar do zero no
# servidor não é opção: são 2 vCPU e pouco mais de 1 GB livre, e o build do Vite
# competindo com o Postgres derruba o CRM que está atendendo.
#
# O caminho daqui é outro: compilar na máquina de desenvolvimento, mandar só os
# artefatos (uns 400 KB) e montar no servidor uma camada nova sobre a imagem que
# já roda. O build lá vira três COPY, que custam segundos e nenhuma RAM.
#
# Isto é uma ponte, não o destino. Quando o Actions voltar, o `deploy.sh` volta a
# ser o caminho certo e este script pode ser apagado.
#
# Uso: bash scripts/subir-sem-ci.sh
set -euo pipefail

SERVIDOR="${SERVIDOR:-apps-noclient}"  # 204.168.249.111 desde 10/09/2026 (antes: applications)
IMAGEM="current-app"
PASTA="/opt/agenda-crm"
HOJE="$(date +%Y%m%d)"

cd "$(dirname "$0")/.."

echo "=== Deploy do Agenda CRM (sem CI) ==="

# Nada sobe com a árvore suja: a imagem carrega o commit como rótulo, e um
# rótulo que aponta para um commit que não contém o que está no ar é pior que
# rótulo nenhum.
if [ -n "$(git status --porcelain)" ]; then
  echo "! Há alteração não commitada. Commite antes de subir:"
  git status --short
  exit 1
fi
COMMIT="$(git rev-parse --short HEAD)"
echo "· commit: $COMMIT"

echo "▸ conferindo o código"
npm run typecheck
npm run lint
npm run test:backend

echo "▸ compilando"
npm run build

echo "▸ empacotando"
PACOTE="$(mktemp -t crm-dist-XXXXXX.tgz)"
trap 'rm -f "$PACOTE"' EXIT
tar czf "$PACOTE" dist dist-server backend scripts package.json package-lock.json
echo "· $(du -h "$PACOTE" | cut -f1)"

echo "▸ enviando"
ssh "$SERVIDOR" "mkdir -p $PASTA/deploy-local && rm -rf $PASTA/deploy-local/*"
# `tar | ssh` em vez de rsync: o servidor não tem rsync instalado.
cat "$PACOTE" | ssh "$SERVIDOR" "cat > $PASTA/deploy-local/dist.tgz"

echo "▸ montando a camada e subindo"
ssh "$SERVIDOR" "bash -s" <<REMOTO
set -euo pipefail
cd $PASTA/deploy-local
tar xzf dist.tgz

# Os scripts operacionais vivem no host, não na imagem: quem chama o backup é o
# cron do sistema, em $PASTA/current/scripts. Como o current é um release
# desempacotado (não um clone git), um conserto no repositório só chegava aqui
# num release completo — foi assim que o backup quebrado de 11/08 continuou
# rodando. Sincronizar aqui mantém o host e o repositório de acordo.
install -m 755 scripts/*.sh $PASTA/current/scripts/

# Guarda a imagem que está no ar antes de mexer: voltar atrás é um
# \`docker tag\` e um \`up -d\`.
ATUAL=\$(docker inspect --format '{{.Image}}' agenda-crm-app | cut -d: -f2)
docker tag \$ATUAL $IMAGEM:anterior-$HOJE
echo "· imagem anterior guardada como $IMAGEM:anterior-$HOJE"

# O \`npm ci\` reconcilia as dependencias com o lockfile do commit que esta
# subindo. Sem ele a camada herda o node_modules da imagem anterior, e qualquer
# dependencia nova entra no bundle sem existir no container: o
# \`node dist-server/server.js\` morre no import e o app fica em crash-loop.
# Foi o que aconteceria com @fastify/multipart, do upload de midia do inbox.
#
# Completo, e nao \`--omit=dev\`: o passo de migracao abaixo chama
# \`npm run db:migrate\`, que e \`tsx backend/migrate.ts\`, e o tsx e devDependency.
cat > Dockerfile <<'FIM'
FROM BASE_AQUI
LABEL org.opencontainers.image.revision="COMMIT_AQUI"
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY dist ./dist
COPY dist-server ./dist-server
COPY backend ./backend
FIM
sed -i "s|BASE_AQUI|$IMAGEM:anterior-$HOJE|; s|COMMIT_AQUI|$COMMIT|" Dockerfile

# Builder clássico: o BuildKit tenta resolver o \`FROM\` no registro mesmo com a
# imagem presente aqui, e o ghcr.io responde 403 com a conta bloqueada.
DOCKER_BUILDKIT=0 docker build -q -t $IMAGEM:latest .

cd $PASTA/current
docker compose --env-file .env.production.local -f docker-compose.production.yml up -d --force-recreate app

# O schema é idempotente, mas precisa rodar a cada deploy: foi a ausência desta
# etapa que deixou 8 tabelas (products, segments, media_files, automation_rules,
# team_channels, team_messages, tenant_settings, knowledge_sources) fora do
# banco de produção até 01/09/2026. O \`deploy.sh\` já migrava; aqui faltava.
echo "· esperando o banco aceitar conexão"
for i in \$(seq 1 20); do
  docker compose --env-file .env.production.local -f docker-compose.production.yml exec -T db pg_isready -U agenda_crm -d agenda_crm >/dev/null 2>&1 && break
  sleep 2
done

echo "· migrando o schema"
docker compose --env-file .env.production.local -f docker-compose.production.yml exec -T app npm run db:migrate
REMOTO

echo "▸ conferindo"
for i in $(seq 1 20); do
  if ssh "$SERVIDOR" "curl -sf -m 5 http://127.0.0.1:3020/api/health" >/dev/null 2>&1; then
    NO_AR=$(ssh "$SERVIDOR" "docker inspect agenda-crm-app --format '{{index .Config.Labels \"org.opencontainers.image.revision\"}}'")
    echo "· no ar, revisão $NO_AR"
    [ "$NO_AR" = "$COMMIT" ] || { echo "! subiu, mas com a revisão errada"; exit 1; }
    ssh "$SERVIDOR" "docker image prune -f" >/dev/null
    exit 0
  fi
  sleep 3
done

echo "! não respondeu em 60s. Para voltar atrás:"
echo "  ssh $SERVIDOR \"docker tag $IMAGEM:anterior-$HOJE $IMAGEM:latest && cd $PASTA/current && docker compose --env-file .env.production.local -f docker-compose.production.yml up -d --force-recreate app\""
ssh "$SERVIDOR" "cd $PASTA/current && docker compose --env-file .env.production.local -f docker-compose.production.yml logs --tail 40 app"
exit 1

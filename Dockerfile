# Imagem de produção do Agenda CRM.
#
# É o artefato que o pipeline da plataforma publica no GHCR e que o despachante
# do servidor implanta pelo digest (.github/workflows/deploy-production.yml, com
# os workflows compartilhados do avilaops/infra). Ela serve aos dois modos do
# despachante: no modo container o compose roda esta imagem pelo CMD abaixo; no
# modo systemd o servidor copia /app para uma release e roda com o Node do host.
# Por isso tudo o que a aplicação precisa para subir mora em /app.

FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/cli ./packages/cli
# Sem scripts de instalação: o build não depende de nenhum, e uma dependência
# comprometida não ganha um shell dentro da imagem que vai para produção.
RUN npm ci --ignore-scripts --no-audit --no-fund
COPY . .
# O Vite grava as VITE_* no bundle durante o build, e no runner não existe .env.
# Elas chegam como build-arg, das variáveis do repositório. São públicas por
# definição: terminam no JavaScript que o navegador baixa.
ARG VITE_SUPORTE_WHATSAPP
ARG VITE_SUPORTE_EMAIL
RUN npm run build

FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json ./
COPY packages/cli ./packages/cli
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --from=build /app/dist-server ./dist-server
# O backend em TypeScript vai junto para `npm run db:migrate` e o
# `agenda db migrate` do CLI funcionarem no artefato como na máquina de
# desenvolvimento. É por isso que o tsx é dependência de execução.
COPY backend ./backend
COPY --chmod=755 scripts/iniciar-container.sh /usr/local/bin/iniciar-container
# O processo roda como node. Um volume novo montado em /app/storage herda este
# dono; um antigo, gravado como root, é barrado pelo ponto de entrada.
RUN mkdir -p storage/media storage/newsletter && chown -R node:node storage
USER node
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:' + (process.env.PORT || 3000) + '/api/health').then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# Confere o dono das pastas de dados antes de subir (scripts/iniciar-container.sh).
ENTRYPOINT ["iniciar-container"]
# O despachante só troca a imagem e confere a saúde: não tem etapa de migração.
# Então ela abre o processo, pelo mesmo comando de sempre. O schema é
# idempotente (o CI aplica duas vezes) e, se falhar, o container não sobe, a
# saúde reprova e a imagem anterior volta.
CMD ["sh", "-c", "npm run db:migrate && exec node dist-server/server.js"]

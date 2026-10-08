# Agenda CRM - Operacao

## Produção hoje

Desde 08/10/2026 o CRM roda no servidor `applications`, no padrão da
plataforma (o mesmo do TMS e do auth):

| O quê | Onde |
| --- | --- |
| Pasta | `/opt/crm-avilaops-com` (`docker-compose.yml` e `.env`) |
| Compose | [`docker-compose.production.yml`](../docker-compose.production.yml) deste repositório, copiado para lá como `docker-compose.yml` |
| Container | `crm-avilaops-com-web`, na rede `edge`, IP `172.31.0.13`, porta 3000, sem porta publicada |
| Banco | PostgreSQL do host, banco e role `crm_avilaops_com`, por `host.docker.internal` |
| Arquivos | volume `crm-avilaops-com-storage` em `/app/storage` |
| Proxy | bloco `crm.avilaops.com` no Caddyfile do host |
| DNS | registro A direto para o servidor, sem o proxy da Cloudflare |
| Deploy | `/etc/avilaops/deploy/crm.avilaops.com.conf` (versionado no `avilaops/infra`) |
| Backup | banco na lista de `/usr/local/bin/backup-todos-bancos.sh`, diário |

O banco foi restaurado do backup de 05/10/2026 do servidor antigo (4.435
contatos, uma empresa, um usuário). A `ENCRYPTION_KEY` antiga se perdeu com
aquele servidor: os segredos das integrações de IA e de e-mail, cifrados com
ela, foram apagados e precisam ser informados de novo nas telas. O arquivo de
origem ficou em `/opt/backups/crm-agenda_crm-20261005.sql.gz`.

A conta da Meta é lida do auth com a integração `crm` cadastrada lá
(`AUTH_META_CLIENT_ID` e `AUTH_META_CLIENT_SECRET` no `.env`).

Logs: `docker logs -f crm-avilaops-com-web`. Migrar à mão:
`docker exec crm-avilaops-com-web npm run db:migrate`.

As seções **Logs**, **Backup** e **Restore** mais abaixo, e os scripts
`deploy.sh`, `subir-sem-ci.sh`, `deploy-candidate.sh`,
`backup-agenda-crm.sh` e `restore-agenda-crm.sh`, descrevem a stack antiga em
`/opt/agenda-crm`, que não existe mais. Não usar sem reescrever.

## Deploy

Todo push na `main` passa pelo [`deploy-production.yml`](../.github/workflows/deploy-production.yml), o mesmo pipeline dos outros produtos da plataforma (`avilaops/infra`):

1. **verify**: `npm run validate`, o `schema.sql` aplicado duas vezes num Postgres 18.6 descartável, o pacote do CLI e o worker.
2. **image**: o `container.yml` do infra constrói o [`Dockerfile`](../Dockerfile) e, na `main`, publica `ghcr.io/avilaops/crm.avilaops.com@sha256:…`. Em PR, só constrói.
3. **deploy**: o `deploy-ssh.yml` do infra entra no servidor com uma chave presa ao domínio e chama `deploy crm.avilaops.com <imagem>`. O despachante troca a imagem do serviço, confere `/api/health` e volta a anterior sozinho se ela não responder.

O despachante não migra banco. Quem migra é a imagem, ao iniciar: o `CMD` roda `npm run db:migrate` antes do servidor. Se o schema falhar, o container não sobe, a saúde reprova e a versão anterior volta. Para migrar à mão, o comando é o mesmo: `docker compose exec app npm run db:migrate`, ou `agenda db migrate`.

O processo roda como o usuário `node` (1000:1000), nunca como root. Antes de subir, o ponto de entrada (`scripts/iniciar-container.sh`) confere se as pastas de `MEDIA_DIR` e `NEWSLETTER_STORAGE_PATH` pertencem a esse usuário. Se achar arquivo de outro dono, o container recusa subir e diz qual é. A saúde reprova e a versão anterior volta, em vez de o CRM subir sem conseguir salvar anexo.

### Ligar o deploy

Até isto ser feito, o pipeline valida e constrói a imagem, mas não implanta.

No GitHub, em *Settings* do repositório:

| Tipo | Nome | Valor |
| --- | --- | --- |
| Variável | `DEPLOY_ENABLED` | `true`. Sem ela o job deploy fica pulado. |
| Secret | `DEPLOY_HOST`, `DEPLOY_USER` | O servidor onde o CRM roda e o usuário de deploy dele. |
| Secret | `DEPLOY_KNOWN_HOSTS` | A chave pública desse servidor (`ssh-keyscan`), conferida à mão. |
| Secret | `DEPLOY_SSH_KEY` | Uma chave nova. O despachante prende cada chave a um domínio, então a do app.avilaops.com não implanta o CRM. |
| Variável | `VITE_SUPORTE_WHATSAPP`, `VITE_SUPORTE_EMAIL` | Contato de suporte. São públicos: vão para o bundle. O WhatsApp vai só com dígitos e DDI (`5511999990000`); com máscara ou `+`, o valor é descartado e o botão some. |

O job deploy roda no ambiente `production`, que o GitHub cria no primeiro uso. Nele dá para exigir aprovação antes de cada deploy.

No servidor, como root:

1. O despachante do `avilaops/infra` instalado (`/usr/local/sbin/avila-deploy`).
2. A chave pública no `authorized_keys` do usuário de deploy, presa ao domínio:

   ```text
   command="sudo /usr/local/sbin/avila-deploy crm.avilaops.com \"$SSH_ORIGINAL_COMMAND\"",restrict ssh-ed25519 AAAA… crm.avilaops.com
   ```

3. O destino em `/etc/avilaops/deploy/crm.avilaops.com.conf`, dono root e sem escrita para outros usuários. O infra versiona esses arquivos em `deploy/production/`:

   ```sh
   PROJECT_DIR=/opt/crm-avilaops-com
   COMPOSE_FILE=/opt/crm-avilaops-com/docker-compose.yml
   COMPOSE_PROJECT=crm-avilaops-com
   SERVICE=web
   CONTAINER=crm-avilaops-com-web
   IMAGE_REPOSITORY=ghcr.io/avilaops/crm.avilaops.com
   HEALTH_URL=http://172.31.0.13:3000/api/health
   ```

   O despachante só troca a imagem de um container que já existe. A primeira
   subida é à mão: `docker pull` da imagem pelo digest e
   `docker compose -f docker-compose.yml -f /var/lib/avilaops/deploy/crm.avilaops.com/image.yml up -d web`.

4. Quatro conferências no servidor antes do primeiro deploy, escritas para a stack antiga (os nomes mudaram, as regras valem). O despachante volta atrás se algo não bater, mas é melhor não descobrir assim:
   - `docker inspect agenda-crm-app --format '{{index .Config.Labels "com.docker.compose.project"}}'` devolve o `COMPOSE_PROJECT`. Sem `name:` no arquivo, o compose usa o nome da pasta, `current`.
   - O serviço `app` não tem `command:`. Se tiver, ele passa por cima do `CMD` da imagem e o schema deixa de rodar no deploy.
   - O `app` recebe o ambiente por `env_file:`. O despachante não passa `--env-file .env.production.local`, então um `${VAR}` no compose chegaria vazio.
   - O volume de arquivos passa a ser do usuário `node`. Ele foi gravado pelo container antigo, que rodava como root: `docker run --rm -v agenda-crm-storage:/s node:24-alpine chown -R 1000:1000 /s` (confira o nome do volume no compose).

Vale pôr `init: true` no serviço `app`: o Node roda como PID 1 e não trata `SIGTERM`, então cada troca de container espera 10 s pelo `SIGKILL`.

### Sem o pipeline

Enquanto o deploy pelo pipeline não estiver ligado, o caminho é o `scripts/subir-sem-ci.sh`. O `scripts/deploy.sh` puxa a tag `:latest`, que o pipeline não publica (as tags são `sha-<commit>`), então subiria uma imagem antiga. Os dois podem sair depois do primeiro deploy verde.

A branch `codex/crm-dez-tarefas` trouxe um terceiro caminho por SSH, validado em 28/09/2026: [`scripts/deploy-candidate.sh`](../scripts/deploy-candidate.sh), com build local, backup e rollback, usando imagem local identificada pelo commit. Evidências e procedimento em [`CRM-ENTREGA-2026-09-28.md`](CRM-ENTREGA-2026-09-28.md). Ele foi escrito antes do pipeline acima e não foi reconciliado com o `subir-sem-ci.sh`; confirmar qual dos dois vale antes de usar.

### Node nativo

A decisão de 01/09 é rodar o Node fora do container. A mesma imagem serve ao modo `systemd` do despachante: ele copia o `/app` da imagem para uma release nova, troca o link e reinicia a unit, com o mesmo rollback. O `.conf` passa a ser:

```sh
DEPLOY_MODE=systemd
IMAGE_REPOSITORY=ghcr.io/avilaops/crm.avilaops.com
APP_ROOT=/opt/crm-avilaops-com
SYSTEMD_UNITS="crm-avilaops-com.service"
ENTRYPOINT=dist-server/server.js
HEALTH_URL=http://127.0.0.1:3020/api/health
```

A unit usa `WorkingDirectory=/opt/crm-avilaops-com`, um usuário próprio em `User=`, `ExecStartPre=/usr/bin/npm run db:migrate` e `ExecStart=/usr/bin/node dist-server/server.js`, com Node 24 no host. Três cuidados:

- `MEDIA_DIR` e `NEWSLETTER_STORAGE_PATH` apontam para fora da release. O despachante apaga as releases antigas depois de cada deploy aprovado, e o padrão (`storage/` dentro do app) iria junto.
- O ambiente fica em `/opt/crm-avilaops-com/.env`, que o despachante leva de uma release para a outra.
- O servidor escuta em `0.0.0.0`. No host, a porta 3020 só pode estar aberta para o Caddy.

## Logs

```sh
cd /opt/agenda-crm/current
docker compose -f docker-compose.production.yml logs -f app
docker compose -f docker-compose.production.yml logs -f db
```

Para os logs da aplicacao:

```sh
agenda --cwd /opt/agenda-crm/current docker logs
```

## Backup

```sh
/opt/agenda-crm/current/scripts/backup-agenda-crm.sh
```

## Restore

Teste primeiro em ambiente separado.

```sh
/opt/agenda-crm/current/scripts/restore-agenda-crm.sh /opt/agenda-crm/backups/agenda-crm-YYYYMMDDTHHMMSSZ.sql.gz
```

## Rollback

O deploy volta sozinho para a imagem anterior quando a nova não passa em `/api/health`. Para desfazer uma versão que passou na saúde mas está errada, reverta o commit na `main`: o pipeline publica e implanta de novo.

## Secrets

Rotacione `ADMIN_INITIAL_PASSWORD`, `SETUP_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `ENCRYPTION_KEY` e tokens Meta periodicamente. Nunca publique valores em commit, issue ou log.

Valide apenas os nomes/configuracao, sem exibir valores:

```sh
agenda --cwd /opt/agenda-crm/current env check --mode production
```

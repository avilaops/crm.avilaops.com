# Agenda CRM - Operacao

## Deploy

O app roda isolado em `/opt/agenda-crm/current` com Docker Compose.

```sh
cd /opt/agenda-crm/current
docker compose -f docker-compose.production.yml up -d --build
docker compose -f docker-compose.production.yml exec app npm run db:migrate
```

Com o CLI instalado, os mesmos comandos ficam padronizados:

```sh
agenda --cwd /opt/agenda-crm/current docker up
agenda --cwd /opt/agenda-crm/current docker migrate
agenda --cwd /opt/agenda-crm/current doctor --mode production
```

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

```sh
ln -sfn /opt/agenda-crm/releases/COMMIT_ANTERIOR /opt/agenda-crm/current
cd /opt/agenda-crm/current
docker compose -f docker-compose.production.yml up -d --build
```

## Secrets

Rotacione `ADMIN_INITIAL_PASSWORD`, `SETUP_TOKEN`, `META_WEBHOOK_VERIFY_TOKEN`, `ENCRYPTION_KEY` e tokens Meta periodicamente. Nunca publique valores em commit, issue ou log.

Valide apenas os nomes/configuracao, sem exibir valores:

```sh
agenda --cwd /opt/agenda-crm/current env check --mode production
```

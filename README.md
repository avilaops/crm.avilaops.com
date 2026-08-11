# Agenda Contatos Web

Frontend web privado para um CRM multi-tenant com WhatsApp, funil de vendas, inbox, automações e agenda como módulo auxiliar.

Responsável técnico: Nícolas Ávila  
Empresa: Ávila Ops Tecnologia  
Software privado.

## Funcionalidades

- Funil de vendas em kanban.
- Lista de leads.
- Inbox de WhatsApp com contexto de cliente, espera e status.
- Tarefas, chat em equipe, analytics, formulários, botão de chat e integrações.
- Agenda de contatos como item auxiliar do CRM.
- Base visual para integração WhatsApp OAuth2 e multi-tenant.

## Desenvolvimento web

```powershell
npm install
npm run db:migrate
npm run dev:api
npm run dev
```

O Vite abrirá a aplicação em `http://localhost:5173` e redirecionará `/api` para o backend em `http://localhost:3000`.

## Validação

```powershell
npm run db:migrate
npm run build
npm run lint
```

## Execução com backend

```powershell
npm run db:migrate
npm run build
npm start
```

O backend serve a API e o frontend compilado no mesmo processo.

- Frontend: `http://localhost:3000/`
- API: `http://localhost:3000/api`
- Healthcheck: `http://localhost:3000/api/health`

## Deploy com Docker

Em produção, use uma stack isolada:

```powershell
docker compose --env-file .env.production.local -f docker-compose.production.yml up -d --build
docker compose --env-file .env.production.local -f docker-compose.production.yml exec app npm run db:migrate
```

O app expõe apenas `127.0.0.1:3020` no host. O Postgres fica somente na rede Docker `agenda-crm`.

## Banco local

Configure `.env.local`:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agenda_crm
PORT=3000
DEFAULT_TENANT_SLUG=avila-ops
SETUP_TOKEN=troque-este-token
META_WEBHOOK_VERIFY_TOKEN=troque-este-token
```

O schema cria a base do CRM:

- `tenants`, `users`
- `contacts`, `leads`, `pipelines`, `pipeline_stages`
- `channels`, `conversations`, `messages`
- `tasks`, `integrations`, `events`

## Integração Meta

O frontend chama `/api/meta`. O backend cria a URL OAuth, troca o código por token e salva credenciais/status no Postgres.

Fluxo atual:

- `GET /api/meta/status`: mostra se o app Meta está configurado e conectado.
- `POST /api/meta/credentials`: salva App ID e App Secret no Postgres.
- `GET /api/meta/login-url`: cria a URL de login Meta.
- `POST /api/meta/exchange`: troca o `code` OAuth por token de longa duração.
- `POST /api/meta/disconnect`: remove o token salvo.
- `GET/POST /api/meta/webhook`: validação e recebimento inicial de eventos Meta.

As rotas administrativas exigem `X-Setup-Token` com o valor de `SETUP_TOKEN`.

No app Meta, cadastre o callback conforme o domínio final do servidor:

```text
https://SEU-DOMINIO/oauth-callback.html
```

## Próximo passo para multi-tenant

A base multi-tenant já existe no Postgres. O próximo passo é processar o payload real dos webhooks WhatsApp/Instagram para popular `channels`, `contacts`, `conversations`, `messages` e `events`.

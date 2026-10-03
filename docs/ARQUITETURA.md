# Arquitetura do Agenda CRM

> Mapa do sistema como ele é hoje, levantado lendo o código e consultando o
> banco de produção em 28/08/2026. Serve de base para o backlog.
>
> Onde o levantamento contradiz o que se supunha, está marcado **⚠ divergência**.

## Sumário

- [Divergências encontradas](#divergências-encontradas)
- [Pilha e arquitetura](#pilha-e-arquitetura)
- [Front-end](#front-end)
- [Back-end](#back-end)
- [Banco de dados](#banco-de-dados)
- [Dados reais em produção](#dados-reais-em-produção)
- [Rotas: front × back](#rotas-front--back)
- [Testes](#testes)
- [Riscos de segurança](#riscos-de-segurança)

---

## Divergências encontradas

Cinco suposições do levantamento pela interface não se confirmam no código. Três
delas mudam a prioridade do backlog.

| # | Suposição | Realidade | Impacto |
|---|---|---|---|
| 1 | Banco é **MariaDB** | É **PostgreSQL 16** (driver `pg`, `gen_random_uuid()`, `jsonb`, `text[]`). O job "Server (Mariadb)" do repo `avilainc/erp` é de **outro projeto** | Qualquer SQL do backlog precisa ser Postgres |
| 2 | O 500 de `/api/audit-logs` vem do filtro `entityType=all` | O tratamento de `"all"` está **correto**. O erro são **duas colunas inexistentes** na query | Correção é de 2 linhas, não de lógica |
| 3 | Segmentos, Produtos, Mídia e Automações "não têm implementação" | Os **quatro back-ends existem e são reais** — CRUD completo, Zod, `recordEvent`, tabelas criadas | Bloco 2 encolhe drasticamente: falta só a tela |
| 4 | Telefone vazio em 100% dos contatos | **4.225 de 4.435 contatos têm telefone** (95%) | O dado existe; o bug é de exibição |
| 5 | Empresas pode ser derivado do domínio do e-mail | Só **237 contatos têm e-mail** (5%), e apenas ~210 com domínio corporativo. Mas **793 têm o campo `company` preenchido** (698 nomes distintos) | Derivar por domínio cobriria 5% da base; por nome, 18% |

---

## Pilha e arquitetura

Monólito: um processo Fastify serve a API e entrega o SPA compilado.

```
navegador
   │  https://crm.avilaops.com
   ▼
Caddy (host)  ──► 127.0.0.1:3020
   ▼
agenda-crm-app (Docker, node:24-alpine)
   ├── Fastify 5           API em /api/* e /nl/*
   ├── @fastify/static     serve dist/ (SPA)
   └── notFoundHandler     404 JSON para /api/*, index.html para o resto
   ▼
agenda-crm-db (Docker, postgres:16-alpine)   banco agenda_crm
```

| Camada | Tecnologia |
|---|---|
| Front | React 19, Vite 8, Tailwind 4, Radix UI, `lucide-react` |
| Back | Fastify 5, TypeScript, Zod 4 |
| Banco | **PostgreSQL 16** via `pg` (pool), SQL escrito à mão — sem ORM |
| Sessão | Cookie `agenda_session`, hash SHA-256 na tabela `sessions`, 7 dias |
| Senha | `scrypt` (`scrypt$salt$hash`) — bcrypt causava timeout com jitless |
| SSO | Cookie `avila_sso` (JWT HS256) do `auth.avilaops.com`, opcional |
| Build | `tsc -b` + `tsc -p tsconfig.server.json` + `vite build` |
| Deploy | Imagem no `ghcr.io`, servidor só faz `docker compose pull` |

### Estrutura de pastas

```
backend/           API (TypeScript, ESM, compilado para dist-server/)
  server.ts        ~2.500 linhas: auth, contatos, leads, pipeline, tarefas,
                   empresas, canais, Meta, audit-logs, integrações
  routes-*.ts      módulos: mail, ai, products, automations, segments,
                   media, team, settings
  db.ts            pool do Postgres e helper query()
  schema.sql       schema completo (645 linhas), idempotente
  migrate.ts       aplica schema.sql inteiro
  test/            2 arquivos, 15 testes (node --test)
src/               SPA React (compilado para dist/)
  App.tsx          roteamento (30 linhas) — ver bug 1.2
  routes.ts        mapa Page ↔ path
  pages/           CrmWorkspace.tsx e telas
  lib/crm.ts       cliente HTTP
  components/      layout, modals, drawers
worker/            worker separado da Meta (npm próprio)
packages/cli/      CLI `agenda` (workspace npm)
```

---

## Front-end

**SPA compilado pelo Vite, bundle único**, sem code splitting. Roteamento por
**hash**, implementado à mão em `App.tsx` (30 linhas) — não há React Router.

### O roteamento, e por que deep link quebra

`src/routes.ts` mantém o mapa `Page → path`. `src/App.tsx` faz o resto:

```ts
const [page, setPage] = useState<Page>(() => getPageFromHash(window.location.hash))
```

**O estado inicial lê apenas `window.location.hash` e ignora `window.location.pathname`.**
É a causa exata dos dois sintomas relatados:

1. Abrir `https://crm.avilaops.com/leads/pipeline/` → o servidor devolve
   `index.html` (o fallback SPA **funciona**), mas o hash está vazio, então
   `getPageFromHash("")` cai no `?? 'home'` e o app abre em INÍCIO.
2. Clicar no menu faz `window.location.hash = '#/communications/inbox/'`, que
   **preserva o pathname anterior** → `/mail/inbox/#/communications/inbox/`.

O `setNotFoundHandler` em `server.ts:2442` já serve `index.html` para tudo que
não é `/api/*`. **A infraestrutura para history API já está pronta**; falta só o
front deixar de ignorar o pathname.

> **Corrigido em 02/10/2026.** `App.tsx` converte o caminho em hash
> (`hashFromPathname`, em `src/routes.ts`) e devolve a barra para a raiz do app;
> endereços antigos das Configurações são redirecionados (`legacyRedirects`), e
> a conversa aberta no inbox tem endereço próprio (`/communications/inbox/<id>/`).

---

## Back-end

**125 rotas HTTP**, todas em uma instância Fastify. Os `routes-*.ts` são funções
`registerXRoutes(app, deps)` que recebem `requireAuth` e `recordEvent` por
injeção — não há prefixo de plugin.

### Autenticação

`requireAuth` (`server.ts:199`) valida o cookie de sessão e responde 401. É o
único guarda existente.

> ⚠ **Não existe `requireAdmin` em lugar nenhum.** `POST /api/users` e
> `PATCH /api/users/:id` aceitam qualquer usuário autenticado, mesmo com papel
> "Atendente" — inclusive para alterar o próprio papel. Ver [Riscos](#riscos-de-segurança).

### Rotas por módulo

| Módulo | Arquivo | Rotas | Estado |
|---|---|---|---|
| Núcleo (auth, contatos, leads, pipeline, tarefas, empresas, Meta, audit) | `server.ts` | 57 | real |
| E-mail e newsletter | `routes-mail.ts` | 31 | real (6 públicas em `/nl/*`) |
| IA | `routes-ai.ts` | 11 | real |
| Automações | `routes-automations.ts` | 6 | **real** |
| Produtos | `routes-products.ts` | 4 | **real** |
| Segmentos | `routes-segments.ts` | 4 | **real** |
| Configurações e conhecimento | `routes-settings.ts` | 6 | real |
| Chat da equipe | `routes-team.ts` | 4 | real |
| Mídia | `routes-media.ts` | 3 | **real** (só metadados, sem upload) |

---

## Banco de dados

**PostgreSQL 16.** Schema em `backend/schema.sql`, 645 linhas, aplicado inteiro
por `npm run db:migrate`. É idempotente (`create table if not exists` +
`alter table ... add column if not exists`), mas **não há versionamento de
migrations** — não existe tabela de controle nem rollback.

### 32 tabelas

`tenants` · `users` · `sessions` · `contacts` · `pipelines` · `pipeline_stages` ·
`leads` · `channels` · `conversations` · `messages` · **`companies`** · `tasks` ·
`integrations` · `external_references` · `inbound_events` · `events` ·
`newsletter_campaigns` · `newsletter_deliveries` · `mail_senders` ·
`automation_settings` · `automation_runs` · `newsletter_signups` · `ai_runs` ·
`ai_suggestions` · **`products`** · **`automation_rules`** · **`segments`** ·
`media_files` · `team_channels` · `team_messages` · `tenant_settings` ·
`knowledge_sources`

Em negrito, as que o backlog supunha inexistentes.

### `contacts` — o coração da base

```
id uuid · tenant_id uuid · name text · email text · phone text
company text          ← nome da empresa em TEXTO LIVRE
company_id uuid       ← vínculo relacional (hoje sempre NULL)
source text · cpf_cnpj text · tags text[] · newsletter_status text
unsubscribed_at timestamptz · created_at · updated_at
```

Note a **duplicidade `company` (texto) × `company_id` (FK)**. É a chave do item
1.4: a rotina de derivação precisa ler `company`/`email` e popular `company_id`.

---

## Dados reais em produção

Consultado em 28/08/2026 (`pg_stat_user_tables` + contagens diretas).

### Tabelas com dados

| Tabela | Linhas |
|---|---|
| `contacts` | **4.435** |
| `mail_senders` | 17 |
| `events` | 5 |
| `sessions` | 5 |
| `pipeline_stages` | 4 |
| `ai_runs` | 2 |
| `integrations` | 2 |
| `pipelines`, `newsletter_campaigns`, `tenants`, `users`, `channels` | 1 cada |

### Tabelas vazias

`companies` · `leads` · `tasks` · `conversations` · `messages` ·
`newsletter_signups` · `newsletter_deliveries` · `automation_settings` ·
`automation_runs` · `ai_suggestions` · `inbound_events` · `external_references`

> As telas de Empresas, Segmentos, Produtos, Mídia e Automações **não estão
> quebradas: estão vazias.** O back-end responde; não há o que listar.

### Preenchimento de `contacts` (4.435 registros)

| Campo | Preenchidos | % |
|---|---|---|
| `phone` | **4.225** | **95%** |
| `company` (texto) | 793 (698 distintos) | 18% |
| `email` | 237 | 5% |
| `company_id` (FK) | **0** | 0% |

> ⚠ **Item 1.5 muda de natureza.** O telefone **existe em 95% da base**. Se a
> coluna mostra "-" em todos, o defeito está na exibição ou na query da tela,
> não no dado. Diagnóstico correto antes de qualquer migração.

### Viabilidade da derivação de empresas (item 1.4)

| Estratégia | Cobertura |
|---|---|
| Domínio do e-mail, fora dos genéricos | ~210 contatos (**5%**) |
| Campo `company` em texto | 793 contatos, 698 nomes (**18%**) |
| **Combinada** | ~18% da base |

Domínios mais frequentes: `gmail.com` (27), `hotmail.com` (15),
`nardini.ind.br` (7), `outlook.com` (5), `titaniumdobrasil.com.br` (5).

> A recomendação do backlog era chavear **pelo domínio do e-mail**. Com 5% de
> cobertura, o **nome em texto deve ser a fonte primária** e o domínio o
> complemento — o inverso do proposto.

---

## Rotas: front × back

### Telas sem back-end dedicado

| Tela | Situação |
|---|---|
| `/#/lists/all/` | **Não existe rota unificada.** O mais próximo é `GET /api/bootstrap`, que traz `contacts` (limit 50) e `companies` (limit 100) no mesmo payload. Precisa de endpoint novo ou união no cliente |
| `/#/calendar/` | Consome `GET /api/tasks`. Não há endpoint de calendário — o menu promete algo que a tela não é |

### Telas com back-end pronto e tela vazia

`/#/segments/`, `/#/lists/products/`, `/#/lists/media/`, `/#/automations/` —
os quatro têm CRUD completo no servidor. **Falta apenas a interface.**

### Endpoints órfãos (sem tela que os use)

- `POST /api/ai/transcribe` — transcrição de áudio (recém-ligada ao `ia.avilaops.com`)
- `GET /api/contacts/:id/timeline` — timeline do contato
- `POST /api/conversations/:id/lead` e `/assign`
- `GET /api/integrations/erp/*` — 5 rotas de integração com ERP
- `POST /api/automations/:id/test`
- `GET /api/automation/runs`

---

## Testes

**Existe suíte**, ao contrário do que o backlog supunha.

```bash
npm run test:backend   # tsc + node --test backend/test/*.test.mjs  → 15 testes
npm test               # CLI + backend
npm run check          # typecheck + lint (oxlint) + testes
npm run validate       # check + build   ← o que o CI roda
```

`backend/test/crm-modules.test.mjs` e `newsletter.test.mjs`, 15 testes passando.
São testes de unidade sobre funções puras — **não há teste de integração
batendo em rota HTTP nem em banco**, que é justamente o que teria pego o bug do
`/api/audit-logs`.

---

## Riscos de segurança

Em ordem de gravidade.

### 1. Escalada de privilégio — qualquer usuário vira admin

`POST /api/users` (`server.ts:919`) e `PATCH /api/users/:id` (`:942`) exigem
apenas sessão válida. Um usuário "Atendente" pode criar administradores ou
promover a si mesmo. **A interface mostra papéis que o servidor não impõe.**

### 2. Trilha de auditoria inexistente

`GET /api/audit-logs` falha em **100% das chamadas** (duas colunas inexistentes),
e a tabela `events` tem **5 linhas, todas `auth.login`**. Na prática, não há
auditoria: criação de usuário, troca de credencial e exclusão de contato não
deixam rastro consultável.

### 3. Stack trace vazando

O erro do Postgres sobe cru até o cliente como "Internal Server Error", e o log
do servidor registra a query inteira. Falta `requestId` na resposta e um
tratador global de erro.

### 4. `limit`/`offset` interpolados sem validação

Em `/api/audit-logs`, `z.coerce.number()` sem `.int().min()` permite `page=0`
(offset negativo → erro SQL) e `pageSize=1e9`. Os valores vão direto na string
SQL. Não é injeção (são números), mas é negação de serviço fácil. O resto do
servidor usa `listQuerySchema`, que valida — basta reusar.

### 5. Subquery de `companies` sem `tenant_id`

`(select count(*)::int from contacts where company_id = companies.id)` não
filtra por tenant. Hoje inofensivo (o `company_id` já é do tenant), mas é um
vazamento esperando uma mudança de schema. Também é N+1 em SQL.

### 6. `PATCH` com `coalesce` impede limpar campo

Em `companies` e outros, `set campo = coalesce($n, campo)` faz com que enviar
`null` mantenha o valor antigo. Não há como apagar um telefone errado.

---

## Próximos passos sugeridos

Considerando as divergências, a ordem do backlog muda:

1. **1.1 audit-logs** — 2 linhas. Destrava a auditoria e é pré-requisito do 4.1.
2. **1.2 deep link** — concentrado em `App.tsx`; o servidor já está pronto.
3. **1.5 telefone** — investigar a exibição antes de migrar; o dado existe em 95%.
4. **Bloco 2** — só faltam telas; o back-end dos quatro módulos já existe.
5. **4.1 `requireAdmin`** — a escalada de privilégio é o risco mais sério aberto.

Itens que **não** precisam do trabalho previsto: criar back-end de Segmentos,
Produtos, Mídia e Automações (já existem) e criar suíte de testes (já existe —
falta cobertura de integração).

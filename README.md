# Agenda CRM

Aplicacao web privada para um CRM multi-tenant com WhatsApp, funil de vendas, inbox, automacoes e agenda como modulo auxiliar.

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

## Inbox em tempo real

O inbox recebe mensagem, tique de entrega e transcricao de audio sem recarregar
a pagina, por um fluxo SSE em `GET /api/realtime`. A distribuicao entre
instancias usa `LISTEN/NOTIFY` do proprio Postgres — nao ha broker novo no
desenho e subir uma segunda replica nao exige reescrita.

O nginx precisa entregar esse endpoint sem buffer (`nginx/nginx.conf` ja traz a
regra); o backend tambem manda `X-Accel-Buffering: no` para proxies que nao
estejam sob esse arquivo.

### Anexos

Midia recebida e baixada da Graph API em segundo plano e guardada em
`MEDIA_DIR`, que precisa ficar num volume persistente (`/app/storage/media` no
compose). O arquivo e servido por `GET /api/media/:id/content`, com sessao —
a URL assinada da Meta nunca chega ao navegador. O limite de tamanho fica em
`MEDIA_MAX_BYTES` (16 MB por padrao).

### Janela de 24 horas e templates

A API oficial so aceita texto livre nas 24 horas seguintes a ultima mensagem do
cliente. A listagem de conversas ja devolve `window_open` e `window_expires_at`,
o envio de texto fora da janela responde `409` com `code: "window_closed"` e a
tela troca sozinha para o seletor de templates aprovados.

Os templates vem da WABA por `POST /api/whatsapp/templates/sync` e ficam no
banco: consultar a Graph a cada abertura do inbox gastaria o rate limit da
conta num dado que quase nao muda.

## Desenvolvimento web

```powershell
npm install
npm run db:migrate
npm run dev:full
```

O Vite abrirá a aplicação em `http://localhost:5173` e redirecionará `/api` para o backend em `http://localhost:3000`.

## Validação

```powershell
npm run db:migrate
npm run validate
```

`npm run validate` roda typecheck, lint, os testes do CLI, do backend e do
front (`npm run test:web`: rotas, tabela de preço do WhatsApp, formatação e
checklist de ativação) e o build.

As telas nos tamanhos reais de uso (375, 390, 768, 1024 e 1440 px) são
conferidas com a API simulada por `scripts/telas/verificar.mjs`, com o Vite
rodando; o como está em [`docs/PLANO-MOBILE-E-CANAIS.md`](docs/PLANO-MOBILE-E-CANAIS.md#como-validar).

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

## CLI

Os comandos operacionais tambem estao disponiveis pelo CLI oficial:

```powershell
npm run cli -- help
npm run doctor
npx @avilaops/agenda-cli doctor
```

Exemplos:

```powershell
npm run cli -- dev
npm run cli -- db migrate
npm run cli -- docker status
npm run cli -- worker typecheck
npm run cli -- env check --mode local
```

A referencia completa esta em [`docs/CLI-E-NPM.md`](docs/CLI-E-NPM.md).

## Deploy

Todo push na `main` passa pelo pipeline da plataforma ([`.github/workflows/deploy-production.yml`](.github/workflows/deploy-production.yml)): valida, constrói a imagem e, com o deploy ligado, implanta pelo despachante do `avilaops/infra`, que volta à versão anterior sozinho se a nova não responder. Como ligar, o que o servidor precisa e como desfazer: [`docs/OPERACAO.md`](docs/OPERACAO.md).

Em produção o container não publica porta: o Caddy do servidor chega nele pela rede `edge`, e o banco é o PostgreSQL do host. O retrato atual está no começo do [`docs/OPERACAO.md`](docs/OPERACAO.md).

## Banco local

Configure `.env.local`:

```text
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/agenda_crm
PORT=3000
DEFAULT_TENANT_SLUG=avila-ops
META_WEBHOOK_VERIFY_TOKEN=troque-este-token
```

O schema cria a base do CRM:

- `tenants`, `users`
- `contacts`, `leads`, `pipelines`, `pipeline_stages`
- `channels`, `conversations`, `messages`
- `tasks`, `integrations`, `events`

## WhatsApp

Quem fala com a Meta é a Messageria (`sms.avilaops.com`); o CRM se liga a ela
com a chave da conta, em **Configurações › Canais › WhatsApp › Configuração
avançada**. A mesma tela mostra o estado da conexão, o que muda no celular e o
preço da Meta em reais, com simulador. O porquê está em
[`docs/INTEGRACAO-MESSAGERIA.md`](docs/INTEGRACAO-MESSAGERIA.md) e o plano da
conexão oficial com Coexistência em
[`docs/PLANO-MOBILE-E-CANAIS.md`](docs/PLANO-MOBILE-E-CANAIS.md).

A conexão por QR Code (WhatsApp Web) foi desativada: é um caminho que a Meta não
permite e pode custar o número do cliente.

## Conta da Meta

A conexão do cliente com a Meta mora no `auth.avilaops.com`: a pessoa conecta o
Facebook da empresa uma vez, em `/conta/meta`, e os sistemas da casa leem de lá.
No CRM isso aparece em **Configurações › Canais › WhatsApp › Configuração
avançada › Conta da Meta**.

- `GET /api/meta/status`: a conta ligada à empresa, de onde ela veio e se há
  pendência.
- `POST /api/meta/sincronizar`: traz a conexão de quem está logado. Só vale
  para quem entrou pelo SSO, e trocar de conta pede confirmação.
- `POST /api/meta/disconnect`: tira da empresa a cópia do token. A conexão
  continua no auth.
- `GET/POST /api/meta/webhook`: recebimento direto da Meta, para empresas que
  ainda têm `app_secret` próprio gravado.

O CRM se identifica no auth com `AUTH_META_CLIENT_ID` e
`AUTH_META_CLIENT_SECRET`, de uma integração criada em `/admin/integracoes` com
a permissão de ler a Meta.

**Limite:** este caminho descobre os números e deixa enviar; ele não recebe
mensagem. O recebimento continua pela Messageria.

O OAuth que o CRM fazia sozinho (`credentials`, `login-url`, `exchange`,
`sync-channels`, com `SETUP_TOKEN`) foi aposentado em 08/10/2026: essas rotas
respondem 410.

## Backlog de produto

O levantamento de paridade funcional esta em [`docs/FUNCIONALIDADES-PENDENTES-KOMMO.md`](docs/FUNCIONALIDADES-PENDENTES-KOMMO.md).

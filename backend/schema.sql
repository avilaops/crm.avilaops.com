create extension if not exists pgcrypto;

create table if not exists tenants (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  created_at timestamptz not null default now()
);

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text not null,
  password_hash text,
  role text not null default 'admin',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table users add column if not exists password_hash text;
alter table users add column if not exists active boolean not null default true;

create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists sessions_user_id_idx on sessions(user_id);
create index if not exists sessions_expires_at_idx on sessions(expires_at);

create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  email text,
  phone text,
  company text,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, phone)
);

create table if not exists pipelines (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists pipeline_stages (
  id uuid primary key default gen_random_uuid(),
  pipeline_id uuid not null references pipelines(id) on delete cascade,
  name text not null,
  position int not null,
  color text not null default '#3b82f6',
  unique (pipeline_id, position)
);

create table if not exists leads (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  stage_id uuid references pipeline_stages(id) on delete set null,
  title text not null,
  value_cents int not null default 0,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  external_id text,
  display_name text not null,
  phone_number text,
  status text not null default 'pending',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider, external_id)
);

alter table channels add column if not exists team_name text;
alter table channels add column if not exists last_sync_at timestamptz;
alter table channels add column if not exists error_message text;

create table if not exists conversations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  contact_id uuid references contacts(id) on delete set null,
  assigned_user_id uuid references users(id) on delete set null,
  status text not null default 'open',
  archived_at timestamptz,
  last_message_at timestamptz,
  last_customer_message_at timestamptz,
  last_agent_message_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid not null references conversations(id) on delete cascade,
  external_id text,
  direction text not null,
  sender_name text,
  sender_phone text,
  body text,
  message_type text not null default 'text',
  metadata jsonb not null default '{}'::jsonb,
  status text not null default 'received',
  idempotency_key text,
  error_message text,
  request_id text,
  sent_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, external_id)
);

alter table messages add column if not exists status text not null default 'received';
alter table messages add column if not exists idempotency_key text;
alter table messages add column if not exists error_message text;
alter table messages add column if not exists request_id text;

create unique index if not exists messages_tenant_id_idempotency_key_idx on messages(tenant_id, idempotency_key) where idempotency_key is not null;

create table if not exists companies (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  cnpj text,
  domain text,
  phone text,
  email text,
  address text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table contacts add column if not exists company_id uuid references companies(id) on delete set null;
alter table leads add column if not exists company_id uuid references companies(id) on delete set null;

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  assigned_user_id uuid references users(id) on delete set null,
  title text not null,
  description text,
  priority text not null default 'medium',
  due_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table tasks add column if not exists description text;
alter table tasks add column if not exists priority text not null default 'medium';

create table if not exists integrations (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  provider text not null,
  app_id text,
  app_secret text,
  access_token text,
  user_name text,
  token_expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  connected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (tenant_id, provider)
);

-- O OAuth do Google Calendar grava e le `refresh_token` desde que foi escrito,
-- mas a coluna nunca existiu: o callback estourava no insert e
-- `getGoogleIntegration` falhava em toda chamada. Encontrado passando cada
-- consulta estatica do backend por `prepare` contra um banco recem-migrado.
alter table integrations add column if not exists refresh_token text;

-- ── Conciliação com o ERP (erp.avilaops.com) ────────────────────────────────
--
-- O CRM e o ERP não compartilham banco nem id: são dois sistemas com donos
-- distintos de cada dado — aqui mora o relacionamento (conversa, funil,
-- tarefa), lá mora a transação (pedido, pagamento, estoque, fiscal). A ponte
-- entre os dois é esta tabela, espelho de `ExternalReference` no ERP.
--
-- Guardar `erp_customer_id` como coluna em `contacts` teria sido mais curto e
-- pior: o próximo sistema pediria outra coluna, e a limpeza de um vínculo
-- errado viraria um UPDATE em massa.
create table if not exists external_references (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  system text not null,
  entity_type text not null,
  entity_id uuid not null,
  external_id text not null,
  metadata jsonb not null default '{}'::jsonb,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, system, entity_type, entity_id),
  unique (tenant_id, system, entity_type, external_id)
);

create index if not exists external_references_system_idx on external_references(tenant_id, system);

-- Idempotência de entrada. O ERP entrega pelo menos uma vez — é o contrato do
-- outbox dele —, então o mesmo `order.confirmed` chega duas vezes com alguma
-- frequência. Sem este unique, a segunda entrega criaria o segundo lead.
create table if not exists inbound_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  source text not null,
  external_id text not null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  error text,
  created_at timestamptz not null default now(),
  unique (tenant_id, source, external_id)
);

create index if not exists inbound_events_pending_idx on inbound_events(tenant_id, source, processed_at);

-- CPF/CNPJ é a chave canônica de pessoa no ERP (documento fiscal). Aqui ele é
-- opcional: um lead de Instagram não tem documento, e exigir um impediria o
-- CRM de fazer o que ele faz melhor, que é capturar cedo.
alter table contacts add column if not exists cpf_cnpj text;
create index if not exists contacts_cpf_cnpj_idx on contacts(tenant_id, cpf_cnpj) where cpf_cnpj is not null;

-- Fechamento do ciclo: o lead que virou pedido lá aponta para ele aqui.
alter table leads add column if not exists erp_order_id text;
alter table leads add column if not exists won_at timestamptz;

create table if not exists events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references tenants(id) on delete cascade,
  actor_user_id uuid references users(id) on delete set null,
  entity_type text not null,
  entity_id uuid,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  request_id text,
  created_at timestamptz not null default now()
);

alter table events add column if not exists request_id text;

-- Inbox em tempo real: nao lidos por conversa.
--
-- O contador vive na conversa, e nao numa contagem por mensagem, porque a
-- pergunta que a tela faz o tempo todo e "quantas faltam ler aqui" — resolver
-- isso com count(*) em messages custaria uma varredura por linha da lista.
alter table conversations add column if not exists unread_count int not null default 0;
alter table conversations add column if not exists last_read_at timestamptz;

create index if not exists conversations_tenant_last_message_idx on conversations(tenant_id, last_message_at desc);
create index if not exists messages_conversation_sent_at_idx on messages(tenant_id, conversation_id, sent_at);

-- Midia do WhatsApp. O binario fica no volume (`MEDIA_DIR`), nao no Postgres:
-- audio e video de atendimento enchem o banco rapido e quebram o dump dos
-- scripts de backup. A linha guarda o que a tela precisa para decidir o que
-- renderizar antes de baixar o arquivo.
create table if not exists message_media (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  conversation_id uuid references conversations(id) on delete cascade,
  direction text not null default 'inbound',
  external_id text,
  mime_type text not null default 'application/octet-stream',
  file_name text,
  file_size int,
  sha256 text,
  storage_path text,
  caption text,
  status text not null default 'pending',
  error_message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists message_media_tenant_created_at_idx on message_media(tenant_id, created_at desc);
create unique index if not exists message_media_tenant_external_id_idx on message_media(tenant_id, external_id) where external_id is not null;

alter table messages add column if not exists media_id uuid references message_media(id) on delete set null;

-- Templates aprovados na Meta. Sao a unica forma de falar com quem nao
-- escreve ha mais de 24h, entao a lista precisa estar no banco: consultar a
-- Graph a cada abertura do inbox gastaria o rate limit da conta.
create table if not exists whatsapp_templates (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid references channels(id) on delete set null,
  waba_id text,
  external_id text,
  name text not null,
  language text not null,
  category text,
  status text not null default 'PENDING',
  components jsonb not null default '[]'::jsonb,
  body_text text,
  variable_count int not null default 0,
  synced_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (tenant_id, name, language)
);

create index if not exists whatsapp_templates_tenant_status_idx on whatsapp_templates(tenant_id, status);

insert into tenants (name, slug)
values ('Avila Ops Tecnologia', 'avila-ops')
on conflict (slug) do nothing;

insert into users (tenant_id, name, email, role)
select id, 'Nicolas Rosa', 'nicolasrosaab@gmail.com', 'admin'
from tenants
where slug = 'avila-ops'
on conflict (tenant_id, email) do nothing;

insert into pipelines (tenant_id, name)
select id, 'Funil de vendas'
from tenants
where slug = 'avila-ops'
and not exists (
  select 1 from pipelines p where p.tenant_id = tenants.id and p.name = 'Funil de vendas'
);

insert into pipeline_stages (pipeline_id, name, position, color)
select p.id, stage.name, stage.position, stage.color
from pipelines p
join tenants t on t.id = p.tenant_id
cross join (
  values
    ('Leads de entrada', 1, '#fde047'),
    ('Decidindo', 2, '#a855f7'),
    ('Discussao de contrato', 3, '#84cc16'),
    ('Decisao final', 4, '#3b82f6')
) as stage(name, position, color)
where t.slug = 'avila-ops'
on conflict (pipeline_id, position) do nothing;

-- ── E-mail e newsletter ─────────────────────────────────────────────────────
--
-- A conta de e-mail (IMAP para ler, SMTP para enviar) é cadastrada pela tela,
-- não por variável de ambiente: quem troca a senha da caixa é o Nicolas, e ele
-- não deveria precisar de deploy para isso. A senha vai criptografada na mesma
-- coluna `app_secret` que o resto das integrações usa.

alter table contacts add column if not exists tags text[] not null default '{}';
alter table contacts add column if not exists newsletter_status text not null default 'subscribed';
alter table contacts add column if not exists unsubscribed_at timestamptz;

create index if not exists contacts_newsletter_idx
  on contacts(tenant_id, newsletter_status);
create index if not exists contacts_email_idx
  on contacts(tenant_id, lower(email)) where email is not null;

create table if not exists newsletter_campaigns (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  subject text not null,
  preview_text text,
  format text not null default 'html',
  html text,
  body_text text,
  image_url text,
  image_alt text,
  image_link_url text,
  audience_tags text[] not null default '{}',
  status text not null default 'draft',
  recipient_count int not null default 0,
  sent_count int not null default 0,
  failed_count int not null default 0,
  created_by_user_id uuid references users(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsletter_campaigns_format_check check (format in ('html', 'text', 'image')),
  constraint newsletter_campaigns_status_check check (status in ('draft', 'sending', 'sent', 'failed'))
);

create index if not exists newsletter_campaigns_status_idx
  on newsletter_campaigns(tenant_id, status, created_at desc);

-- Uma linha por destinatário. A chave única é o que faz "tentar de novo"
-- retomar o envio em vez de mandar tudo outra vez.
create table if not exists newsletter_deliveries (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  campaign_id uuid not null references newsletter_campaigns(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  email text not null,
  status text not null default 'pending',
  provider_id text,
  error text,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  unique (campaign_id, email),
  constraint newsletter_deliveries_status_check check (status in ('pending', 'sent', 'failed', 'skipped'))
);

create index if not exists newsletter_deliveries_campaign_idx
  on newsletter_deliveries(campaign_id, status);

-- Remetentes já vistos na caixa de entrada. Serve para a tela de e-mail
-- oferecer "cadastrar contato" sabendo quantas vezes aquela pessoa escreveu e
-- quando foi a última vez, sem reprocessar a caixa inteira a cada abertura.
create table if not exists mail_senders (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text,
  message_count int not null default 1,
  last_subject text,
  last_seen_at timestamptz not null default now(),
  status text not null default 'new',
  contact_id uuid references contacts(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (tenant_id, email),
  constraint mail_senders_status_check check (status in ('new', 'registered', 'ignored'))
);

create index if not exists mail_senders_status_idx
  on mail_senders(tenant_id, status, last_seen_at desc);

-- ── Automação do e-mail ─────────────────────────────────────────────────────
--
-- O motor roda dentro do próprio servidor, num laço com relógio. Não é fila
-- externa de propósito: o volume é de centenas por dia, não de milhões, e um
-- Redis a mais seria mais coisa para manter do que para ganhar.
--
-- `enabled` começa desligado. Automação que já nasce ligada é o jeito clássico
-- de descobrir que ela funciona por um e-mail que não devia ter saído.

create table if not exists automation_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  enabled boolean not null default false,
  mailbox_sync_minutes int not null default 15,
  send_batch_size int not null default 20,
  send_interval_seconds int not null default 20,
  daily_cap int not null default 200,
  updated_at timestamptz not null default now(),
  constraint automation_settings_ritmo_check check (
    mailbox_sync_minutes between 1 and 1440
    and send_batch_size between 1 and 200
    and send_interval_seconds between 0 and 3600
    and daily_cap between 0 and 5000
  )
);

-- Diário de bordo: toda execução deixa rastro, inclusive a que não fez nada.
-- Sem isso, "por que não enviou?" não tem resposta.
create table if not exists automation_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  job text not null,
  status text not null,
  detail jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  constraint automation_runs_status_check check (status in ('ok', 'error', 'skipped'))
);

create index if not exists automation_runs_recentes_idx
  on automation_runs(tenant_id, started_at desc);

-- Campanha agendada e ritmo por campanha.
alter table newsletter_campaigns add column if not exists scheduled_at timestamptz;
alter table newsletter_campaigns add column if not exists last_dispatch_at timestamptz;

-- O status ganhou 'scheduled' e 'paused'; a restrição antiga não os conhecia.
alter table newsletter_campaigns drop constraint if exists newsletter_campaigns_status_check;
alter table newsletter_campaigns add constraint newsletter_campaigns_status_check
  check (status in ('draft', 'scheduled', 'sending', 'paused', 'sent', 'failed'));

create index if not exists newsletter_campaigns_agendadas_idx
  on newsletter_campaigns(tenant_id, status, scheduled_at)
  where status in ('scheduled', 'sending');

-- ── Captação com dupla confirmação ──────────────────────────────────────────
--
-- Pedido de inscrição feito no site. Vira contato só depois que a pessoa
-- confirma pelo link: quem só digita o endereço de outro não consegue inscrever
-- ninguém, e a confirmação é a prova de consentimento que vale numa reclamação.

create table if not exists newsletter_signups (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  email text not null,
  name text,
  source text not null default 'site',
  tags text[] not null default '{}',
  status text not null default 'pending',
  request_ip text,
  user_agent text,
  confirmation_sent_at timestamptz,
  confirmed_at timestamptz,
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now(),
  unique (tenant_id, email),
  constraint newsletter_signups_status_check check (status in ('pending', 'confirmed', 'expired'))
);

create index if not exists newsletter_signups_pendentes_idx
  on newsletter_signups(tenant_id, status, confirmation_sent_at);

-- ── Agente de IA ────────────────────────────────────────────────────────────
--
-- A chave do provedor vive em `integrations` (provider 'ai'), criptografada,
-- como a da conta de e-mail: trocar chave não pode exigir deploy.
--
-- Toda chamada deixa registro aqui. IA sem trilha de uso vira caixa-preta cara:
-- ninguém sabe o que foi perguntado, quanto custou, nem por que respondeu
-- aquilo.
create table if not exists ai_runs (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  job text not null,
  model text not null,
  status text not null default 'ok',
  input_tokens int not null default 0,
  output_tokens int not null default 0,
  duration_ms int not null default 0,
  detail jsonb not null default '{}'::jsonb,
  error text,
  created_at timestamptz not null default now(),
  constraint ai_runs_status_check check (status in ('ok', 'error'))
);

create index if not exists ai_runs_recentes_idx on ai_runs(tenant_id, created_at desc);

-- Sugestão de catalogação que espera revisão humana. A IA propõe; quem aplica
-- é a pessoa — ou o lote, depois de conferir a amostra.
create table if not exists ai_suggestions (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  entity_type text not null,
  entity_id uuid not null,
  job text not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'pending',
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  unique (tenant_id, entity_type, entity_id, job),
  constraint ai_suggestions_status_check check (status in ('pending', 'applied', 'discarded'))
);

create index if not exists ai_suggestions_pendentes_idx
  on ai_suggestions(tenant_id, job, status, created_at desc);

-- ── Catálogo de Produtos e Serviços ──────────────────────────────────────────
create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  sku text,
  category text not null default 'Geral',
  price_cents int not null default 0,
  description text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_tenant_idx on products(tenant_id, active);

-- ── Regras de Automação Comercial e n8n ─────────────────────────────────────
create table if not exists automation_rules (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  trigger_type text not null,
  conditions jsonb not null default '{}'::jsonb,
  action_type text not null,
  action_payload jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  runs_count int not null default 0,
  last_run_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists automation_rules_tenant_idx on automation_rules(tenant_id, active, trigger_type);

-- ── Segmentos e Públicos ───────────────────────────────────────────────────
create table if not exists segments (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  rules jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists segments_tenant_idx on segments(tenant_id);

-- ── Central de Mídia e Documentos ──────────────────────────────────────────
create table if not exists media_files (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  file_type text not null default 'document',
  file_size_bytes bigint not null default 0,
  url text not null,
  category text not null default 'Geral',
  created_at timestamptz not null default now()
);

create index if not exists media_files_tenant_idx on media_files(tenant_id, category);

-- ── Chat Interno da Equipe ─────────────────────────────────────────────────
create table if not exists team_channels (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  name text not null,
  description text,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists team_messages (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  channel_id uuid not null references team_channels(id) on delete cascade,
  user_id uuid references users(id) on delete set null,
  user_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_messages_channel_idx on team_messages(tenant_id, channel_id, created_at asc);

-- Semeia canais de equipe padrão para tenants existentes
insert into team_channels (tenant_id, name, description, is_default)
select id, 'Geral', 'Canal geral da equipe para avisos e comunicados', true
from tenants
where slug = 'avila-ops'
and not exists (
  select 1 from team_channels tc where tc.tenant_id = tenants.id and tc.name = 'Geral'
);

insert into team_channels (tenant_id, name, description, is_default)
select id, 'Vendas & Negociações', 'Discussões sobre propostas e fechamentos', false
from tenants
where slug = 'avila-ops'
and not exists (
  select 1 from team_channels tc where tc.tenant_id = tenants.id and tc.name = 'Vendas & Negociações'
);

insert into team_channels (tenant_id, name, description, is_default)
select id, 'Suporte & Atendimento', 'Alinhamento e repasses de chamados', false
from tenants
where slug = 'avila-ops'
and not exists (
  select 1 from team_channels tc where tc.tenant_id = tenants.id and tc.name = 'Suporte & Atendimento'
);

-- ── Configurações Avançadas de Workspace, Chat e IA ────────────────────────
create table if not exists tenant_settings (
  tenant_id uuid primary key references tenants(id) on delete cascade,
  workspace_name text not null default 'Ávila Ops Workspace',
  cnpj text,
  phone text,
  email text,
  address text,
  timezone text not null default 'America/Sao_Paulo',
  currency text not null default 'BRL',
  business_hours jsonb not null default '{"enabled": true, "start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}'::jsonb,
  welcome_message text default 'Olá! Bem-vindo à Ávila Ops. Como podemos ajudar seu negócio hoje?',
  away_message text default 'Nosso horário de atendimento é de seg a sex das 08h às 18h. Deixe sua mensagem e responderemos o mais breve possível!',
  auto_assign boolean not null default true,
  sla_minutes int not null default 15,
  ai_copilot_enabled boolean not null default true,
  ai_autonomous_reply boolean not null default false,
  ai_tone text not null default 'consultivo',
  ai_custom_instructions text default 'Você é o consultor de negócios e vendas da Ávila Ops. Seja objetivo, cordial e foque em entender o cenário do cliente antes de recomendar soluções.',
  updated_at timestamptz not null default now()
);

-- ── Fontes de Conhecimento RAG para IA ──────────────────────────────────────
create table if not exists knowledge_sources (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  title text not null,
  type text not null default 'faq',
  content text not null,
  active boolean not null default true,
  times_used int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists knowledge_sources_tenant_idx on knowledge_sources(tenant_id, active);



-- CRM core, 2026-09-28: additive and compatible with the previous image.
alter table contacts add column if not exists assigned_user_id uuid references users(id) on delete set null;
alter table leads add column if not exists assigned_user_id uuid references users(id) on delete set null;
alter table leads add column if not exists tags text[] not null default '{}';
alter table leads add column if not exists lost_reason text;
alter table leads add column if not exists lost_at timestamptz;
alter table tasks add column if not exists conversation_id uuid references conversations(id) on delete set null;
alter table tasks add column if not exists reminder_at timestamptz;
alter table tasks add column if not exists reminder_dismissed_at timestamptz;
alter table pipeline_stages add column if not exists required_fields text[] not null default '{}';

-- Enforce ownership even for imports, background workers and concurrent writes.
create or replace function crm_check_tenant_link() returns trigger language plpgsql as $$
declare target_id uuid; target_tenant uuid;
begin
  target_id := (to_jsonb(new)->>tg_argv[0])::uuid;
  if target_id is null then return new; end if;
  if tg_argv[1] = 'pipeline_stages' then
    select p.tenant_id into target_tenant from pipeline_stages s join pipelines p on p.id = s.pipeline_id where s.id = target_id for share of p;
  else
    execute format('select tenant_id from %I where id = $1', tg_argv[1]) into target_tenant using target_id;
  end if;
  if target_tenant is null or target_tenant <> new.tenant_id then
    raise exception 'Vinculo invalido para esta empresa' using errcode = '23503';
  end if;
  return new;
end $$;
drop trigger if exists crm_tenant_sessions_user_id on sessions;
create trigger crm_tenant_sessions_user_id before insert or update on sessions for each row execute function crm_check_tenant_link('user_id', 'users');
drop trigger if exists crm_tenant_contacts_company_id on contacts;
create trigger crm_tenant_contacts_company_id before insert or update on contacts for each row execute function crm_check_tenant_link('company_id', 'companies');
drop trigger if exists crm_tenant_contacts_assigned_user_id on contacts;
create trigger crm_tenant_contacts_assigned_user_id before insert or update on contacts for each row execute function crm_check_tenant_link('assigned_user_id', 'users');
drop trigger if exists crm_tenant_leads_contact_id on leads;
create trigger crm_tenant_leads_contact_id before insert or update on leads for each row execute function crm_check_tenant_link('contact_id', 'contacts');
drop trigger if exists crm_tenant_leads_company_id on leads;
create trigger crm_tenant_leads_company_id before insert or update on leads for each row execute function crm_check_tenant_link('company_id', 'companies');
drop trigger if exists crm_tenant_leads_stage_id on leads;
create trigger crm_tenant_leads_stage_id before insert or update on leads for each row execute function crm_check_tenant_link('stage_id', 'pipeline_stages');
drop trigger if exists crm_tenant_leads_assigned_user_id on leads;
create trigger crm_tenant_leads_assigned_user_id before insert or update on leads for each row execute function crm_check_tenant_link('assigned_user_id', 'users');
drop trigger if exists crm_tenant_tasks_contact_id on tasks;
create trigger crm_tenant_tasks_contact_id before insert or update on tasks for each row execute function crm_check_tenant_link('contact_id', 'contacts');
drop trigger if exists crm_tenant_tasks_lead_id on tasks;
create trigger crm_tenant_tasks_lead_id before insert or update on tasks for each row execute function crm_check_tenant_link('lead_id', 'leads');
drop trigger if exists crm_tenant_tasks_assigned_user_id on tasks;
create trigger crm_tenant_tasks_assigned_user_id before insert or update on tasks for each row execute function crm_check_tenant_link('assigned_user_id', 'users');
drop trigger if exists crm_tenant_tasks_conversation_id on tasks;
create trigger crm_tenant_tasks_conversation_id before insert or update on tasks for each row execute function crm_check_tenant_link('conversation_id', 'conversations');
drop trigger if exists crm_tenant_conversations_contact_id on conversations;
create trigger crm_tenant_conversations_contact_id before insert or update on conversations for each row execute function crm_check_tenant_link('contact_id', 'contacts');
drop trigger if exists crm_tenant_conversations_channel_id on conversations;
create trigger crm_tenant_conversations_channel_id before insert or update on conversations for each row execute function crm_check_tenant_link('channel_id', 'channels');
drop trigger if exists crm_tenant_conversations_assigned_user_id on conversations;
create trigger crm_tenant_conversations_assigned_user_id before insert or update on conversations for each row execute function crm_check_tenant_link('assigned_user_id', 'users');
drop trigger if exists crm_tenant_messages_conversation_id on messages;
create trigger crm_tenant_messages_conversation_id before insert or update on messages for each row execute function crm_check_tenant_link('conversation_id', 'conversations');
drop trigger if exists crm_tenant_events_actor_user_id on events;
create trigger crm_tenant_events_actor_user_id before insert or update on events for each row execute function crm_check_tenant_link('actor_user_id', 'users');

create or replace function crm_check_lead_stage() returns trigger language plpgsql as $$
declare field text; required text[];
begin
  if new.stage_id is null then return new; end if;
  select required_fields into required from pipeline_stages where id = new.stage_id for share;
  foreach field in array coalesce(required, '{}'::text[]) loop
    if to_jsonb(new)->>field is null or to_jsonb(new)->>field = '' or (field = 'value_cents' and new.value_cents <= 0) then
      raise exception 'Preencha o campo obrigatorio da etapa: %', field using errcode = '23503';
    end if;
  end loop;
  return new;
end $$;
drop trigger if exists crm_lead_stage_fields on leads;
create trigger crm_lead_stage_fields before insert or update on leads for each row execute function crm_check_lead_stage();
create index if not exists tasks_reminder_idx on tasks(tenant_id, assigned_user_id, reminder_at) where status = 'open' and reminder_dismissed_at is null;

create table if not exists crm_oauth_states (
 state_hash text primary key, tenant_id uuid not null references tenants(id) on delete cascade,
 user_id uuid not null references users(id) on delete cascade, provider text not null,
 redirect_uri text not null, expires_at timestamptz not null
);

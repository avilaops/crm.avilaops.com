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
  created_at timestamptz not null default now(),
  unique (tenant_id, email)
);

alter table users add column if not exists password_hash text;

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

create table if not exists tasks (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid not null references tenants(id) on delete cascade,
  contact_id uuid references contacts(id) on delete set null,
  lead_id uuid references leads(id) on delete set null,
  assigned_user_id uuid references users(id) on delete set null,
  title text not null,
  due_at timestamptz,
  status text not null default 'open',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

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

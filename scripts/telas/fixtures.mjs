// Fixtures da API para o harness visual. Dados fictícios de uma transportadora,
// usados só para renderizar as telas sem backend.
const now = Date.now()
const iso = (offsetMin) => new Date(now + offsetMin * 60_000).toISOString()

export const tenantId = '11111111-1111-4111-8111-111111111111'

export const users = [
  { id: 'u1', name: 'Marina Souza', email: 'marina@transportesriopardo.com.br', role: 'admin', active: true, created_at: iso(-90000) },
  { id: 'u2', name: 'Carlos Lima', email: 'carlos@transportesriopardo.com.br', role: 'atendente', active: true, created_at: iso(-80000) },
]

export const sessionUser = { id: 'u1', tenant_id: tenantId, name: 'Marina Souza', email: 'marina@transportesriopardo.com.br', role: 'admin' }

export const channels = [
  {
    id: 'ch1', provider: 'messageria', external_id: 'canal-1', display_name: 'WhatsApp +55 16 99234-0000',
    phone_number: '+55 16 99234-0000', status: 'connected', metadata: { messageria_canal_id: 'canal-1' },
    team_name: null, last_sync_at: iso(-30), error_message: null, created_at: iso(-5000), updated_at: iso(-30),
  },
  {
    id: 'ch2', provider: 'qrcode', external_id: 'avila_whatsapp_11111111', display_name: 'WhatsApp Web QR',
    phone_number: 'Aguardando leitura', status: 'connecting', metadata: {}, team_name: 'Comercial',
    last_sync_at: null, error_message: null, created_at: iso(-50000), updated_at: iso(-50000),
  },
]

export const conversations = [
  {
    id: 'c1', contact_id: 'ct1', status: 'waiting', assigned_user_id: null, contact_name: 'João Pereira (Agro Sul)',
    contact_phone: '+5516992348303', channel_name: 'WhatsApp +55 16 99234-0000', channel_phone: '+55 16 99234-0000',
    channel_provider: 'messageria', assigned_user_name: null, last_message_at: iso(-12), last_customer_message_at: iso(-12),
    waiting_seconds: 720, unassigned: true, unread_count: 2, window_expires_at: iso(24 * 60 - 12), window_open: true,
  },
  {
    id: 'c2', contact_id: 'ct2', status: 'open', assigned_user_id: 'u2', contact_name: 'Fernanda Costa',
    contact_phone: '+5511987654321', channel_name: 'WhatsApp +55 16 99234-0000', channel_phone: '+55 16 99234-0000',
    channel_provider: 'messageria', assigned_user_name: 'Carlos Lima', last_message_at: iso(-300), last_customer_message_at: iso(-60 * 23),
    waiting_seconds: 0, unassigned: false, unread_count: 0, window_expires_at: iso(60), window_open: true,
  },
  {
    id: 'c3', contact_id: 'ct3', status: 'open', assigned_user_id: 'u1', contact_name: 'Distribuidora Paulista',
    contact_phone: '+5517991053597', channel_name: 'WhatsApp +55 16 99234-0000', channel_phone: '+55 16 99234-0000',
    channel_provider: 'messageria', assigned_user_name: 'Marina Souza', last_message_at: iso(-3000), last_customer_message_at: iso(-3000),
    waiting_seconds: 0, unassigned: false, unread_count: 0, window_expires_at: iso(-1560), window_open: false,
  },
]

export const messages = {
  c1: [
    { id: 'm1', conversation_id: 'c1', direction: 'inbound', sender_name: 'João', sender_phone: '+5516992348303', body: 'Bom dia! Vocês fazem coleta em Ribeirão Preto amanhã?', message_type: 'text', status: 'delivered', sent_at: iso(-15) },
    { id: 'm2', conversation_id: 'c1', direction: 'inbound', sender_name: 'João', sender_phone: '+5516992348303', body: 'São 12 paletes, destino Campinas.', message_type: 'text', status: 'delivered', sent_at: iso(-12) },
  ],
  c2: [
    { id: 'm3', conversation_id: 'c2', direction: 'inbound', sender_name: 'Fernanda', sender_phone: '+5511987654321', body: 'Qual o status da entrega 4471?', message_type: 'text', status: 'delivered', sent_at: iso(-60 * 23) },
    { id: 'm4', conversation_id: 'c2', direction: 'outbound', sender_name: 'Carlos', sender_phone: null, body: 'Saiu para entrega às 8h, previsão 14h.', message_type: 'text', status: 'read', sent_at: iso(-300) },
  ],
  c3: [],
}

export const contacts = Array.from({ length: 8 }, (_, i) => ({
  id: `ct${i + 1}`,
  name: ['João Pereira', 'Fernanda Costa', 'Distribuidora Paulista', 'Ana Ribeiro', 'Logística Norte LTDA', 'Paulo Henrique', 'Marcos Vinícius de Albuquerque', 'Beatriz Nogueira'][i],
  email: i % 3 === 0 ? `contato${i}@exemplo.com.br` : null,
  phone: `+55169923483${String(i).padStart(2, '0')}`,
  company: i % 2 === 0 ? 'Agro Sul Cereais' : null,
  source: i % 2 === 0 ? 'whatsapp' : 'importacao',
  tags: [],
  created_at: iso(-10000 - i),
  updated_at: iso(-100 - i),
}))

export const stages = [
  { id: 's1', pipeline_id: 'p1', pipeline_name: 'Comercial', name: 'Novo contato', position: 1, color: '#3b82f6' },
  { id: 's2', pipeline_id: 'p1', pipeline_name: 'Comercial', name: 'Cotação enviada', position: 2, color: '#f59e0b' },
  { id: 's3', pipeline_id: 'p1', pipeline_name: 'Comercial', name: 'Negociação', position: 3, color: '#8b5cf6' },
  { id: 's4', pipeline_id: 'p1', pipeline_name: 'Comercial', name: 'Fechado', position: 4, color: '#10b981' },
]

export const leads = [
  { id: 'l1', title: 'Frete Campinas — 12 paletes', value_cents: 480000, status: 'open', stage_id: 's1', contact_id: 'ct1', contact_name: 'João Pereira', contact_phone: '+5516992348303', contact_company: 'Agro Sul Cereais', stage_name: 'Novo contato', created_at: iso(-200), updated_at: iso(-200) },
  { id: 'l2', title: 'Contrato mensal de distribuição', value_cents: 1250000, status: 'open', stage_id: 's2', contact_id: 'ct3', contact_name: 'Distribuidora Paulista', contact_phone: null, contact_company: null, stage_name: 'Cotação enviada', created_at: iso(-900), updated_at: iso(-900) },
  { id: 'l3', title: 'Transferência Uberlândia', value_cents: 320000, status: 'open', stage_id: 's3', contact_id: 'ct2', contact_name: 'Fernanda Costa', contact_phone: null, contact_company: null, stage_name: 'Negociação', created_at: iso(-1900), updated_at: iso(-1900) },
]

export const settings = {
  tenant_id: tenantId,
  workspace_name: 'Transportes Rio Pardo',
  cnpj: '12.345.678/0001-90',
  phone: '+55 16 3333-4444',
  email: 'contato@transportesriopardo.com.br',
  address: 'Rod. Anhanguera, km 312 — Ribeirão Preto, SP',
  timezone: 'America/Sao_Paulo',
  currency: 'BRL',
  business_hours: { enabled: true, start: '08:00', end: '18:00', days: [1, 2, 3, 4, 5] },
  welcome_message: null,
  away_message: null,
  auto_assign: true,
  sla_minutes: 15,
  ai_copilot_enabled: true,
  ai_autonomous_reply: false,
  ai_tone: 'consultivo',
  ai_custom_instructions: null,
  updated_at: iso(-60),
}

export function routeApi(url, method) {
  const path = url.pathname
  if (path === '/api/auth/session') return { authenticated: true, user: sessionUser }
  if (path === '/api/auth/sso/enabled') return { enabled: false, url: '' }
  if (path === '/api/bootstrap') return { tenant: { id: tenantId, name: 'Transportes Rio Pardo' }, users, currentUser: sessionUser, contacts, channels, conversations: [], messages: [], leads, tasks: [], companies: [] }
  if (path === '/api/users') return { users }
  if (path === '/api/realtime/presence') return { users: [{ id: sessionUser.id, name: sessionUser.name }] }
  if (path === '/api/channels') return { channels }
  if (path === '/api/conversations') return { conversations, pagination: { page: 1, pageSize: 30, total: conversations.length }, unread: { messages: 2, conversations: 1 } }
  const msg = path.match(/^\/api\/conversations\/([^/]+)\/messages$/)
  if (msg && method === 'GET') return { messages: messages[msg[1]] ?? [] }
  if (path === '/api/contacts') return { contacts, pagination: { page: 1, pageSize: 50, total: 4435 } }
  if (path === '/api/leads') return { leads, pagination: { page: 1, pageSize: 50, total: leads.length } }
  if (path === '/api/pipeline') return { stages, leads }
  if (path === '/api/companies') return { companies: [], pagination: { page: 1, pageSize: 50, total: 0 } }
  if (path === '/api/tasks') return { tasks: [], pagination: { page: 1, pageSize: 50, total: 0 } }
  if (path === '/api/settings') return { settings }
  if (path === '/api/knowledge') return { sources: [] }
  if (path === '/api/audit-logs') return { logs: [], pagination: { page: 1, pageSize: 50, total: 0 } }
  if (path === '/api/meta/status') return { configured: false, connected: false, appConfiguredHint: null, userName: null, connectedAt: null, tokenExpiresAt: null, origem: null, conta: null, pendencia: null, numeros: null, paginaDaMeta: 'https://auth.avilaops.com/conta/meta' }
  if (path === '/api/integrations/messageria/status') return { connected: true, baseUrl: 'https://sms.avilaops.com', canalId: 'canal-1', assinaturaRegistrada: true, canais: [{ id: 'canal-1', numero: '+55 16 99234-0000', padrao: true, teste: false }] }
  if (path === '/api/integrations/erp/status') return { connected: false }
  if (path === '/api/integrations/google/status') return { connected: false }
  if (path === '/api/mail/account') return { account: null }
  if (path === '/api/mail/messages') return { total: 0, messages: [] }
  if (path === '/api/mail/senders') return { senders: [] }
  if (path === '/api/newsletter/overview') return { metrics: { subscribed: 0, unsubscribed: 0, total: 0 }, tags: [], campaigns: [], contacts: [] }
  if (path === '/api/newsletter/contacts') return { contacts: [], pagination: { page: 1, pageSize: 50, total: 0 } }
  if (path === '/api/newsletter/signups') return { signups: [], summary: {} }
  if (path === '/api/automation/settings') return { settings: { tenant_id: tenantId, enabled: false, mailbox_sync_minutes: 5, send_batch_size: 20, send_interval_seconds: 30, daily_cap: 500 }, sentToday: 0, hardDisabled: false }
  if (path === '/api/automation/runs') return { runs: [] }
  if (path === '/api/team/channels') return { channels: [{ id: 'tc1', name: 'geral', description: 'Canal da equipe', is_default: true, created_at: iso(-1000) }] }
  if (path.startsWith('/api/team/channels/') && path.endsWith('/messages')) return { channel: { id: 'tc1', name: 'geral', description: null, is_default: true, created_at: iso(-1000) }, messages: [] }
  if (path === '/api/segments') return { segments: [] }
  if (path === '/api/products') return { products: [], categories: [], pagination: { page: 1, pageSize: 50, total: 0, totalPages: 0 } }
  if (path === '/api/media') return { files: [], categories: [], total: 0 }
  if (path === '/api/automations') return { automations: [] }
  if (path === '/api/ai/config') return { config: null, usage: [] }
  if (path === '/api/ai/runs') return { runs: [] }
  if (path === '/api/ai/suggestions') return { suggestions: [] }
  if (method === 'GET') return {}
  return { ok: true }
}

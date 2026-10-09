export type CrmConversation = {
  id: string
  contact_id: string | null
  status: 'open' | 'waiting' | 'archived' | string
  assigned_user_id: string | null
  contact_name: string | null
  contact_phone: string | null
  channel_name: string | null
  channel_phone: string | null
  channel_provider: string | null
  assigned_user_name: string | null
  last_message_at: string | null
  last_customer_message_at: string | null
  waiting_seconds: number
  unassigned: boolean
  unread_count: number
  /** Fim da janela de 24h. `null` quando a regra nao se aplica ao canal. */
  window_expires_at: string | null
  window_open: boolean
}

export type CrmMessage = {
  id: string
  conversation_id: string
  direction: 'inbound' | 'outbound' | string
  sender_name: string | null
  sender_phone: string | null
  body: string | null
  message_type: string
  status: string
  error_message?: string | null
  request_id?: string | null
  sent_at: string
  media_id?: string | null
  media_mime_type?: string | null
  media_file_name?: string | null
  media_file_size?: number | null
  media_status?: 'pending' | 'ready' | 'failed' | string | null
  media_caption?: string | null
}

export type CrmTemplate = {
  id: string
  channel_id: string | null
  name: string
  language: string
  category: string | null
  status: string
  body_text: string | null
  variable_count: number
  synced_at: string
}

export type CrmChannel = {
  id: string
  provider: string
  external_id: string | null
  display_name: string
  phone_number: string | null
  status: string
  metadata: Record<string, unknown>
  team_name: string | null
  last_sync_at: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export type CrmUser = {
  id: string
  name: string
  email: string
  role: string
  active: boolean
  created_at: string
  /** O que aconteceu com o convite por e-mail; nulo para quem nunca foi convidado. */
  invite_status?: 'enviado' | 'falhou' | 'pendente' | null
  invite_detail?: string | null
  invite_at?: string | null
}

export type CrmContact = {
  assigned_user_id?: string | null
  company_id?: string | null
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  tags?: string[]
  newsletter_status?: string
  created_at: string
  updated_at: string
}

export type CrmLead = {
  assigned_user_id?: string | null
  company_id?: string | null
  tags?: string[]
  lost_reason?: string | null
  id: string
  title: string
  value_cents: number
  status: string
  stage_id: string | null
  contact_id: string | null
  contact_name?: string | null
  contact_phone?: string | null
  contact_company?: string | null
  stage_name?: string | null
  stage_color?: string | null
  created_at: string
  updated_at: string
}

export type PipelineStage = {
  id: string
  pipeline_id: string
  pipeline_name: string
  name: string
  position: number
  color: string
}

export type ConversationFilters = {
  status?: string
  channelId?: string
  assignedUserId?: string
  unassigned?: boolean
  slaOverdue?: boolean
  search?: string
  page?: number
  pageSize?: number
}

/**
 * Erro da API com o codigo preservado.
 *
 * A janela de 24h chega como 409 com `code: 'window_closed'`. Se o cliente so
 * guardasse a mensagem, a tela teria que adivinhar pelo texto quando trocar o
 * campo de resposta pelo seletor de templates.
 */
export class ApiError extends Error {
  status: number
  code?: string
  details?: Record<string, unknown>

  constructor(message: string, status: number, code?: string, details?: Record<string, unknown>) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

export async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (response.status === 401) {
    window.location.reload()
    throw new ApiError('Sessao expirada.', 401)
  }
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string; code?: string }
    throw new ApiError(data.error ?? 'Falha ao carregar dados.', response.status, data.code, data)
  }
  return response.json() as Promise<T>
}

function toQuery(filters?: ConversationFilters) {
  const params = new URLSearchParams()
  Object.entries(filters ?? {}).forEach(([key, value]) => {
    if (value !== undefined && value !== '' && value !== false) params.set(key, String(value))
  })
  const query = params.toString()
  return query ? `?${query}` : ''
}

export function bootstrap() {
  return api<{ users: CrmUser[] }>('/api/bootstrap')
}

export function listUsers() {
  return api<{ users: CrmUser[] }>('/api/users')
}

export function createUser(input: { name: string; email: string; role: string; password?: string }) {
  return api<{ user: CrmUser }>('/api/users', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

/** "Enviar convite de novo": a conta Ávila Ops escreve outra vez para a pessoa. */
export function inviteUser(userId: string) {
  return api<{ user: CrmUser }>(`/api/users/${userId}/invite`, { method: 'POST' })
}

export function updateUser(userId: string, input: Partial<{ name: string; email: string; role: string; active: boolean; password: string }>) {
  return api<{ user: CrmUser }>(`/api/users/${userId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export type ConversationsPage = {
  conversations: CrmConversation[]
  pagination: { page: number; pageSize: number; total: number }
  unread: { messages: number; conversations: number }
}

export function listConversations(filters?: ConversationFilters) {
  return api<ConversationsPage>(`/api/conversations${toQuery(filters)}`)
}

/** Zera o nao lido. Separado da leitura das mensagens de proposito. */
export function markConversationRead(conversationId: string) {
  return api<{ ok: boolean }>(`/api/conversations/${conversationId}/read`, { method: 'POST' })
}

export function mediaContentUrl(mediaId: string) {
  return `/api/media/${mediaId}/content`
}

export async function sendConversationMedia(conversationId: string, file: File, caption?: string) {
  const form = new FormData()
  if (caption) form.set('caption', caption)
  // O arquivo vai por ultimo: o backend le os campos que vieram antes dele no
  // fluxo multipart, e uma legenda depois do binario chegaria vazia.
  form.set('file', file, file.name)
  return api<{ message: CrmMessage; requestId: string }>(`/api/conversations/${conversationId}/media`, {
    method: 'POST',
    body: form,
  })
}

export function listWhatsAppTemplates(onlyApproved = true) {
  return api<{ templates: CrmTemplate[] }>(`/api/whatsapp/templates?onlyApproved=${onlyApproved}`)
}

export function syncWhatsAppTemplates() {
  return api<{ created: number; updated: number; total: number; errors: string[] }>('/api/whatsapp/templates/sync', { method: 'POST' })
}

export function sendConversationTemplate(conversationId: string, templateId: string, variables: string[]) {
  return api<{ message: CrmMessage; requestId: string }>(`/api/conversations/${conversationId}/template`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ templateId, variables, idempotencyKey: crypto.randomUUID() }),
  })
}

export function listConversationMessages(conversationId: string) {
  return api<{ messages: CrmMessage[] }>(`/api/conversations/${conversationId}/messages`)
}

export function archiveConversation(conversationId: string) {
  return api<{ ok: boolean }>(`/api/conversations/${conversationId}/archive`, { method: 'POST' })
}

export function createLeadFromConversation(conversationId: string, title?: string) {
  return api<{ lead: CrmLead }>(`/api/conversations/${conversationId}/lead`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
}

export function assignConversation(conversationId: string, userId: string | null) {
  return api<{ ok: boolean }>(`/api/conversations/${conversationId}/assign`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId }),
  })
}

export function sendConversationMessage(conversationId: string, body: string) {
  return api<{ message: CrmMessage; requestId: string }>(`/api/conversations/${conversationId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body, idempotencyKey: crypto.randomUUID() }),
  })
}

export function listChannels() {
  return api<{ channels: CrmChannel[] }>('/api/channels')
}

export function listContacts(filters?: { search?: string; page?: number; pageSize?: number }) {
  return api<{ contacts: CrmContact[]; pagination: { page: number; pageSize: number; total: number } }>(`/api/contacts${toQuery(filters)}`)
}

export function listLeads(filters?: { search?: string; page?: number; pageSize?: number }) {
  return api<{ leads: CrmLead[]; pagination: { page: number; pageSize: number; total: number } }>(`/api/leads${toQuery(filters)}`)
}

export function getPipeline() {
  return api<{ stages: PipelineStage[]; leads: CrmLead[] }>('/api/pipeline')
}

export type CrmTask = {
  conversation_id?: string | null
  reminder_at?: string | null
  id: string
  contact_id: string | null
  lead_id: string | null
  assigned_user_id: string | null
  assigned_user_name?: string | null
  contact_name?: string | null
  lead_title?: string | null
  title: string
  description: string | null
  priority: 'low' | 'medium' | 'high' | string
  due_at: string | null
  status: 'open' | 'completed' | 'canceled' | string
  created_at: string
  updated_at: string
}

export type CrmCompany = {
  id: string
  name: string
  cnpj: string | null
  domain: string | null
  phone: string | null
  email: string | null
  address: string | null
  contacts_count?: number
  created_at: string
  updated_at: string
}

export function listTasks(filters?: { status?: string; contactId?: string; leadId?: string; assignedUserId?: string; search?: string }) {
  return api<{ tasks: CrmTask[]; pagination: { page: number; pageSize: number; total: number } }>(`/api/tasks${toQuery(filters)}`)
}

export type TaskInput = { title: string; description?: string | null; contactId?: string | null; leadId?: string | null; conversationId?: string | null; assignedUserId?: string | null; dueAt?: string | null; reminderAt?: string | null; priority?: 'low' | 'medium' | 'high'; status?: 'open' | 'completed' | 'canceled' }
export function createTask(input: TaskInput) {
  return api<{task:CrmTask}>('/api/tasks',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
}
export function updateTask(id: string, input: Partial<TaskInput>) {
  return api<{task:CrmTask}>(`/api/tasks/${id}`,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(input)})
}

export function deleteTask(taskId: string) {
  return api<{ ok: boolean }>(`/api/tasks/${taskId}`, { method: 'DELETE' })
}

export function listCompanies(filters?: { search?: string; page?: number; pageSize?: number }) {
  return api<{ companies: CrmCompany[]; pagination: { page: number; pageSize: number; total: number } }>(`/api/companies${toQuery(filters)}`)
}

export function createCompany(input: { name: string; cnpj?: string; domain?: string; phone?: string; email?: string; address?: string }) {
  return api<{ company: CrmCompany }>('/api/companies', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateCompany(companyId: string, input: Partial<{ name: string; cnpj: string; domain: string; phone: string; email: string; address: string }>) {
  return api<{ company: CrmCompany }>(`/api/companies/${companyId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteCompany(companyId: string) {
  return api<{ ok: boolean }>(`/api/companies/${companyId}`, { method: 'DELETE' })
}

export function createContact(input: {
  name: string
  email?: string | null
  phone?: string | null
  company?: string | null
  company_id?: string | null
  source?: string | null
  tags?: string[]
}) {
  return api<{ contact: CrmContact }>('/api/contacts', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateContact(contactId: string, input: Partial<{
  name: string
  email: string | null
  phone: string | null
  company: string | null
  company_id: string | null
  source: string | null
  tags: string[]
}>) {
  return api<{ contact: CrmContact }>(`/api/contacts/${contactId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteContact(contactId: string) {
  return api<{ ok: boolean }>(`/api/contacts/${contactId}`, { method: 'DELETE' })
}

export function getContactTimeline(contactId: string) {
  return api<{
    contact: CrmContact
    events: { id: string; entity_type: string; event_type: string; payload: Record<string, unknown>; created_at: string }[]
    tasks: { id: string; title: string; description: string | null; priority: string; due_at: string | null; status: string; created_at: string }[]
    messages: { id: string; direction: string; body: string; sent_at: string; status: string }[]
  }>(`/api/contacts/${contactId}/timeline`)
}

export function createLead(input: {
  title: string
  assigned_user_id?: string
  value_cents?: number
  stage_id?: string | null
  contact_id?: string | null
  company_id?: string | null
}) {
  return api<{ lead: CrmLead }>('/api/leads', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateLead(leadId: string, input: Partial<{
  title: string
  value_cents: number
  status: 'open' | 'won' | 'lost' | 'archived'
  lost_reason: string | null
  stage_id: string | null
  contact_id: string | null
  company_id: string | null
}>) {
  return api<{ lead: CrmLead }>(`/api/leads/${leadId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteLead(leadId: string) {
  return api<{ ok: boolean }>(`/api/leads/${leadId}`, { method: 'DELETE' })
}

export function updateLeadStage(leadId: string, stageId: string) {
  return api<{ lead: CrmLead }>(`/api/leads/${leadId}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageId }),
  })
}

export interface AuditLogEntry {
  id: string
  entity_type: string
  event_type: string
  payload: Record<string, unknown>
  request_id?: string
  user_name?: string
  user_email?: string
  created_at: string
}

export function listAuditLogs(filters?: { entityType?: string; search?: string; page?: number; pageSize?: number }) {
  const params = new URLSearchParams()
  if (filters?.entityType) params.set('entityType', filters.entityType)
  if (filters?.search) params.set('search', filters.search)
  if (filters?.page) params.set('page', String(filters.page))
  if (filters?.pageSize) params.set('pageSize', String(filters.pageSize))

  const queryStr = params.toString()
  return api<{ logs: AuditLogEntry[]; pagination: { page: number; pageSize: number; total: number } }>(
    `/api/audit-logs${queryStr ? `?${queryStr}` : ''}`
  )
}

// ── Produtos e Serviços ───────────────────────────────────────────────────────
export type CrmProduct = {
  id: string
  name: string
  sku: string | null
  category: string
  price_cents: number
  description: string | null
  active: boolean
  created_at: string
  updated_at: string
}

export function listProducts(filters?: { search?: string; category?: string; active?: string; page?: number; pageSize?: number }) {
  return api<{ products: CrmProduct[]; categories: { name: string; total: number }[]; pagination: { page: number; pageSize: number; total: number; totalPages: number } }>(
    `/api/products${toQuery(filters)}`
  )
}

export function createProduct(input: { name: string; sku?: string; category?: string; price_cents?: number; description?: string; active?: boolean }) {
  return api<{ product: CrmProduct }>('/api/products', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateProduct(productId: string, input: Partial<CrmProduct>) {
  return api<{ product: CrmProduct }>(`/api/products/${productId}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteProduct(productId: string) {
  return api<{ success: boolean }>(`/api/products/${productId}`, { method: 'DELETE' })
}

// ── Automações Comerciais & n8n ──────────────────────────────────────────────
export type CrmAutomation = {
  id: string
  name: string
  trigger_type: string
  conditions: Record<string, unknown>
  action_type: string
  action_payload: Record<string, unknown>
  active: boolean
  runs_count: number
  last_run_at: string | null
  created_at: string
}

export function listAutomations() {
  return api<{ automations: CrmAutomation[] }>('/api/automations')
}

export function createAutomation(input: {
  name: string
  trigger_type: string
  conditions?: Record<string, unknown>
  action_type: string
  action_payload?: Record<string, unknown>
  active?: boolean
}) {
  return api<{ automation: CrmAutomation }>('/api/automations', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateAutomation(id: string, input: Partial<CrmAutomation>) {
  return api<{ automation: CrmAutomation }>(`/api/automations/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function toggleAutomation(id: string) {
  return api<{ automation: CrmAutomation }>(`/api/automations/${id}/toggle`, { method: 'POST' })
}

export function testAutomation(id: string) {
  return api<{ result: { success: boolean; detail: string; response?: unknown } }>(`/api/automations/${id}/test`, { method: 'POST' })
}

export function deleteAutomation(id: string) {
  return api<{ success: boolean }>(`/api/automations/${id}`, { method: 'DELETE' })
}

// ── Segmentos & Filtros ──────────────────────────────────────────────────────
export type CrmSegment = {
  id: string
  name: string
  description: string | null
  rules: {
    tags?: string[]
    source?: string
    newsletter_status?: string
    has_phone?: boolean
    has_email?: boolean
    search?: string
  }
  created_at: string
}

export function listSegments() {
  return api<{ segments: CrmSegment[] }>('/api/segments')
}

export function createSegment(input: { name: string; description?: string; rules?: Record<string, unknown> }) {
  return api<{ segment: CrmSegment }>('/api/segments', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function getSegmentContacts(segmentId: string) {
  return api<{ segment: CrmSegment; contacts: CrmContact[]; totalCount: number }>(`/api/segments/${segmentId}/contacts`)
}

export function deleteSegment(segmentId: string) {
  return api<{ success: boolean }>(`/api/segments/${segmentId}`, { method: 'DELETE' })
}

// ── Central de Mídia & Documentos ─────────────────────────────────────────────
export type CrmMediaFile = {
  id: string
  name: string
  file_type: string
  file_size_bytes: number | string
  url: string
  category: string
  created_at: string
}

export function listMediaFiles(filters?: { search?: string; category?: string; file_type?: string }) {
  return api<{ files: CrmMediaFile[]; categories: { name: string; total: number }[]; total: number }>(
    `/api/media${toQuery(filters)}`
  )
}

export function createMediaFile(input: {
  name: string
  file_type: string
  file_size_bytes?: number
  url: string
  category?: string
}) {
  return api<{ file: CrmMediaFile }>('/api/media', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteMediaFile(id: string) {
  return api<{ success: boolean }>(`/api/media/${id}`, { method: 'DELETE' })
}

// ── Chat Interno da Equipe ───────────────────────────────────────────────────
export type CrmTeamChannel = {
  id: string
  name: string
  description: string | null
  is_default: boolean
  created_at: string
}

export type CrmTeamMessage = {
  id: string
  channel_id: string
  user_id: string | null
  user_name: string
  body: string
  created_at: string
}

export function listTeamChannels() {
  return api<{ channels: CrmTeamChannel[] }>('/api/team/channels')
}

export function createTeamChannel(input: { name: string; description?: string }) {
  return api<{ channel: CrmTeamChannel }>('/api/team/channels', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function listTeamMessages(channelId: string) {
  return api<{ channel: CrmTeamChannel; messages: CrmTeamMessage[] }>(`/api/team/channels/${channelId}/messages`)
}

export function sendTeamMessage(channelId: string, body: string) {
  return api<{ message: CrmTeamMessage }>(`/api/team/channels/${channelId}/messages`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ body }),
  })
}

// ── Configurações de Workspace, Chat e IA ────────────────────────────────────
export type TenantSettings = {
  tenant_id: string
  workspace_name: string
  cnpj: string | null
  phone: string | null
  email: string | null
  address: string | null
  timezone: string
  currency: string
  business_hours: {
    enabled: boolean
    start: string
    end: string
    days: number[]
  }
  welcome_message: string | null
  away_message: string | null
  auto_assign: boolean
  sla_minutes: number
  ai_copilot_enabled: boolean
  ai_autonomous_reply: boolean
  ai_tone: string
  ai_custom_instructions: string | null
  updated_at: string
}

export type KnowledgeSource = {
  id: string
  tenant_id: string
  title: string
  type: 'faq' | 'document' | 'url' | 'guideline'
  content: string
  active: boolean
  times_used: number
  created_at: string
  updated_at: string
}

export function getTenantSettings() {
  return api<{ settings: TenantSettings }>('/api/settings')
}

export function updateTenantSettings(input: Partial<TenantSettings>) {
  return api<{ settings: TenantSettings }>('/api/settings', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function listKnowledgeSources() {
  return api<{ sources: KnowledgeSource[] }>('/api/knowledge')
}

export function createKnowledgeSource(input: { title: string; type: string; content: string }) {
  return api<{ source: KnowledgeSource }>('/api/knowledge', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateKnowledgeSource(id: string, input: Partial<{ title: string; type: string; content: string; active: boolean }>) {
  return api<{ source: KnowledgeSource }>(`/api/knowledge/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function deleteKnowledgeSource(id: string) {
  return api<{ ok: boolean }>(`/api/knowledge/${id}`, { method: 'DELETE' })
}



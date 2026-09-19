export type CrmConversation = {
  id: string
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
}

export type CrmContact = {
  id: string
  name: string
  email: string | null
  phone: string | null
  company: string | null
  source: string | null
  created_at: string
  updated_at: string
}

export type CrmLead = {
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
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

export function syncMetaChannels() {
  return api<{ channels: Array<{ id: string; displayPhoneNumber: string | null; verifiedName: string | null }>; created: number; updated: number; total: number }>('/api/meta/sync-channels', {
    method: 'POST',
  })
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

export function createTask(input: { title: string; description?: string; contactId?: string; leadId?: string; assignedUserId?: string; dueAt?: string; priority?: 'low' | 'medium' | 'high' }) {
  return api<{ task: CrmTask }>('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function updateTask(taskId: string, input: { title?: string; description?: string | null; status?: 'open' | 'completed' | 'canceled'; assignedUserId?: string | null; dueAt?: string | null; priority?: 'low' | 'medium' | 'high' }) {
  return api<{ task: CrmTask }>(`/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
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

export function updateLeadStage(leadId: string, stageId: string) {
  return api<{ lead: CrmLead }>(`/api/leads/${leadId}/stage`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ stageId }),
  })
}

export function getQrCodeInstance() {
  return api<{ instanceName: string; qrcode: string | null; status: string; channelId?: string }>('/api/channels/qrcode/instance', { method: 'POST' })
}

export function getQrCodeStatus(instanceName: string) {
  return api<{ status: string; display_name?: string; phone_number?: string }>(`/api/channels/qrcode/status/${instanceName}`)
}

export type CrmConversation = {
  id: string
  status: 'open' | 'waiting' | 'archived' | string
  assigned_user_id: string | null
  contact_name: string | null
  contact_phone: string | null
  channel_name: string | null
  channel_phone: string | null
  assigned_user_name: string | null
  last_message_at: string | null
  last_customer_message_at: string | null
  waiting_seconds: number
  unassigned: boolean
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

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, { ...init, credentials: 'include' })
  if (response.status === 401) {
    window.location.reload()
    throw new Error('Sessao expirada.')
  }
  if (!response.ok) {
    const data = await response.json().catch(() => ({}))
    throw new Error(data.error ?? 'Falha ao carregar dados.')
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

export function listConversations(filters?: ConversationFilters) {
  return api<{ conversations: CrmConversation[]; pagination: { page: number; pageSize: number; total: number } }>(`/api/conversations${toQuery(filters)}`)
}

export function listConversationMessages(conversationId: string) {
  return api<{ messages: CrmMessage[] }>(`/api/conversations/${conversationId}/messages`)
}

export function archiveConversation(conversationId: string) {
  return api<{ ok: boolean }>(`/api/conversations/${conversationId}/archive`, { method: 'POST' })
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

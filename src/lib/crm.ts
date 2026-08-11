export type CrmConversation = {
  id: string
  status: 'open' | 'waiting' | 'archived' | string
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
  sent_at: string
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

export function listConversations() {
  return api<{ conversations: CrmConversation[] }>('/api/conversations')
}

export function listConversationMessages(conversationId: string) {
  return api<{ messages: CrmMessage[] }>(`/api/conversations/${conversationId}/messages`)
}

export function archiveConversation(conversationId: string) {
  return api<{ ok: boolean }>(`/api/conversations/${conversationId}/archive`, { method: 'POST' })
}

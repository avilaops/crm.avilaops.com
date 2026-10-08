import { api } from './crm'

export type MailAccount = {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  user: string
  fromName: string
  fromEmail: string
  hasPassword: boolean
  connectedAt: string | null
  lastError: string | null
}

export type MailCheck = {
  imap: { ok: boolean; detail: string }
  smtp: { ok: boolean; detail: string }
}

export type MailMessage = {
  uid: number
  subject: string
  fromName: string
  fromEmail: string
  to: string[]
  date: string | null
  seen: boolean
}

export type MailSender = {
  id: string
  email: string
  name: string | null
  message_count: number
  last_subject: string | null
  last_seen_at: string
  status: 'new' | 'registered' | 'ignored'
  contact_id: string | null
}

export type NewsletterCampaign = {
  id: string
  name: string
  subject: string
  format: 'html' | 'text' | 'image'
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'failed'
  scheduled_at?: string | null
  recipient_count: number
  sent_count: number
  failed_count: number
  audience_tags: string[]
  created_at: string
  sent_at: string | null
}

export type NewsletterContact = {
  id: string
  name: string
  email: string
  phone?: string | null
  company: string | null
  source: string | null
  tags: string[]
  newsletter_status: 'subscribed' | 'unsubscribed'
  created_at: string
}

export type ContactFilters = {
  search?: string
  tag?: string
  status?: 'subscribed' | 'unsubscribed' | 'todos'
  withEmail?: 'sim' | 'nao' | 'todos'
  page?: number
  pageSize?: number
}

export type NewsletterOverview = {
  metrics: { subscribed: number; unsubscribed: number; total: number }
  tags: { tag: string; count: number }[]
  campaigns: NewsletterCampaign[]
  contacts: NewsletterContact[]
}

export type AutomationSettings = {
  tenant_id: string
  enabled: boolean
  mailbox_sync_minutes: number
  send_batch_size: number
  send_interval_seconds: number
  daily_cap: number
}

export type AutomationRun = {
  id: string
  job: 'mailbox_sync' | 'bounce_scan' | 'campaign_send' | string
  status: 'ok' | 'error' | 'skipped'
  detail: Record<string, unknown>
  started_at: string
  finished_at: string | null
}

export type Signup = {
  id: string
  email: string
  name: string | null
  source: string
  tags: string[]
  status: 'pending' | 'confirmed' | 'expired'
  confirmation_sent_at: string | null
  confirmed_at: string | null
  expires_at: string
  created_at: string
}

export type CampaignRecord = {
  id: string
  name: string
  subject: string
  preview_text: string | null
  format: 'html' | 'text' | 'image'
  html: string | null
  body_text: string | null
  image_url: string | null
  image_alt: string | null
  image_link_url: string | null
  audience_tags: string[]
  status: 'draft' | 'scheduled' | 'sending' | 'paused' | 'sent' | 'failed'
}

export type Delivery = {
  id: string
  email: string
  status: 'pending' | 'sent' | 'failed' | 'skipped'
  error: string | null
  sent_at: string | null
  contact_name: string | null
  company: string | null
}

export type CampaignDraft = {
  name: string
  subject: string
  previewText: string
  format: 'html' | 'text' | 'image'
  html: string
  text: string
  imageUrl: string
  imageAlt: string
  imageLinkUrl: string
  audienceTags: string[]
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function getMailAccount() {
  return api<{ account: MailAccount | null }>('/api/mail/account')
}

export function saveMailAccount(input: Omit<MailAccount, 'hasPassword' | 'connectedAt' | 'lastError'> & { password?: string }) {
  return api<{ account: MailAccount; check: MailCheck | null }>('/api/mail/account', json(input))
}

export function testMailAccount() {
  return api<{ check: MailCheck }>('/api/mail/test', json({}))
}

export function listMailMessages(params: { limit?: number; offset?: number } = {}) {
  const search = new URLSearchParams()
  if (params.limit) search.set('limit', String(params.limit))
  if (params.offset) search.set('offset', String(params.offset))
  const suffix = search.toString() ? `?${search}` : ''
  return api<{ total: number; messages: MailMessage[] }>(`/api/mail/messages${suffix}`)
}

export function readMailMessage(uid: number) {
  return api<{ message: MailMessage; text: string; html: string | null }>(`/api/mail/messages/${uid}`)
}

export function listMailSenders(status: 'new' | 'registered' | 'ignored' | 'todos' = 'new') {
  return api<{ senders: MailSender[] }>(`/api/mail/senders?status=${status}`)
}

export function registerSenderAsContact(
  id: string,
  input: { name: string; company: string; phone: string; tags: string[] },
) {
  return api<{ ok: true; contactId: string }>(`/api/mail/senders/${id}/contact`, json(input))
}

export function ignoreSender(id: string) {
  return api<{ ok: true }>(`/api/mail/senders/${id}/ignore`, json({}))
}

export function newsletterOverview() {
  return api<NewsletterOverview>('/api/newsletter/overview')
}

export function searchNewsletterContacts(filters: ContactFilters = {}) {
  const params = new URLSearchParams()
  Object.entries(filters).forEach(([chave, valor]) => {
    if (valor !== undefined && valor !== '') params.set(chave, String(valor))
  })
  const sufixo = params.toString() ? `?${params}` : ''
  return api<{ contacts: NewsletterContact[]; pagination: { page: number; pageSize: number; total: number } }>(
    `/api/newsletter/contacts${sufixo}`,
  )
}

export function importNewsletterContacts(raw: string, tags: string[]) {
  return api<{ summary: { created: number; updated: number; total: number } }>(
    '/api/newsletter/contacts/import',
    json({ raw, tags }),
  )
}

export function updateNewsletterContact(
  id: string,
  input: {
    name?: string
    company?: string
    phone?: string
    newsletterStatus?: 'subscribed' | 'unsubscribed'
    tags?: string[]
  },
) {
  return api<{ contact: NewsletterContact }>(`/api/newsletter/contacts/${id}`, {
    method: 'PATCH',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function createNewsletterContact(input: {
  name: string
  email: string
  phone: string
  company: string
  tags: string[]
}) {
  return api<{ contact: NewsletterContact }>('/api/newsletter/contacts', json(input))
}

export function bulkContacts(input: {
  ids: string[]
  action: 'tag' | 'untag' | 'subscribe' | 'unsubscribe'
  tag?: string
}) {
  return api<{ updated: number }>('/api/newsletter/contacts/bulk', json(input))
}

export function getCampaign(id: string) {
  return api<{ campaign: CampaignRecord }>(`/api/newsletter/campaigns/${id}`)
}

export function listDeliveries(id: string, status: 'todos' | 'sent' | 'failed' | 'pending' | 'skipped' = 'todos') {
  return api<{ deliveries: Delivery[]; summary: Record<string, number> }>(
    `/api/newsletter/campaigns/${id}/deliveries?status=${status}`,
  )
}

export function deleteCampaign(id: string) {
  return api<{ ok: true }>(`/api/newsletter/campaigns/${id}`, { method: 'DELETE' })
}

export function previewCampaign(draft: CampaignDraft) {
  return api<{ html: string; text: string; recipients: number }>('/api/newsletter/preview', json(draft))
}

export function createCampaign(draft: CampaignDraft) {
  return api<{ campaign: NewsletterCampaign }>('/api/newsletter/campaigns', json(draft))
}

export function updateCampaign(id: string, draft: CampaignDraft) {
  return api<{ campaign: NewsletterCampaign }>(`/api/newsletter/campaigns/${id}`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(draft),
  })
}

export function sendCampaignTest(id: string, to: string) {
  return api<{ ok: true; to: string }>(`/api/newsletter/campaigns/${id}/test`, json({ to }))
}

export function sendCampaign(id: string) {
  return api<{ result: { sent: number; failed: number; remaining: number; status: string; lastError: string | null } }>(
    `/api/newsletter/campaigns/${id}/send`,
    json({}),
  )
}

export function listSignups(status: 'todos' | 'pending' | 'confirmed' | 'expired' = 'todos') {
  return api<{ signups: Signup[]; summary: Record<string, number> }>(`/api/newsletter/signups?status=${status}`)
}

export function getAutomation() {
  return api<{ settings: AutomationSettings; sentToday: number; hardDisabled: boolean }>('/api/automation/settings')
}

export function saveAutomation(input: {
  enabled?: boolean
  mailboxSyncMinutes?: number
  sendBatchSize?: number
  sendIntervalSeconds?: number
  dailyCap?: number
}) {
  return api<{ settings: AutomationSettings }>('/api/automation/settings', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function listAutomationRuns(limit = 40) {
  return api<{ runs: AutomationRun[] }>(`/api/automation/runs?limit=${limit}`)
}

/** Sem `when`, a campanha entra na fila para o motor despachar no proximo ciclo. */
export function scheduleCampaign(id: string, when?: string) {
  return api<{ campaign: CampaignRecord; recipients: number }>(
    `/api/newsletter/campaigns/${id}/schedule`,
    json(when ? { when } : {}),
  )
}

export function pauseCampaign(id: string) {
  return api<{ ok: true }>(`/api/newsletter/campaigns/${id}/pause`, json({}))
}

export function uploadCampaignImage(file: File) {
  return new Promise<{ url: string }>((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = () => reject(new Error('Não foi possível ler o arquivo.'))
    reader.onload = () => {
      const dataBase64 = String(reader.result ?? '').split(',')[1] ?? ''
      api<{ url: string }>('/api/newsletter/images', json({ contentType: file.type, dataBase64 })).then(resolve, reject)
    }
    reader.readAsDataURL(file)
  })
}

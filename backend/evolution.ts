import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { query, transaction } from './db.js'

export type EvolutionConfig = { baseUrl: string; apiKey: string; tenantId: string; instanceName: string }
type User = { tenant_id: string; role: string }
type Json = Record<string, any>
type Dependencies = {
  config?: (tenantId: string) => EvolutionConfig | null
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<User | null | undefined>
  canManage: (user: any) => boolean
  fetch?: typeof fetch
  query?: typeof query
  upsertContact?: (tenantId: string, phone: string, name: string | undefined) => Promise<string>
  conversation?: (tenantId: string, channelId: string | null, contactId: string) => Promise<string>
  publish?: (event: any) => void
  background?: boolean
}

export function evolutionConfig(requestedTenantId?: string): EvolutionConfig | null {
  const baseUrl = process.env.EVOLUTION_API_URL?.trim().replace(/\/$/, '')
  const apiKey = process.env.EVOLUTION_API_KEY?.trim()
  const boundTenantId = process.env.EVOLUTION_TENANT_ID?.trim()
  if (boundTenantId && requestedTenantId && boundTenantId !== requestedTenantId) return null
  const tenantId = boundTenantId || requestedTenantId
  if (!tenantId || !/^[a-f0-9-]{36}$/i.test(tenantId)) return null
  const instanceName = boundTenantId ? process.env.EVOLUTION_INSTANCE_NAME?.trim() : `crm_${tenantId.replaceAll('-', '')}`
  if (!baseUrl || !apiKey || !tenantId || !instanceName) return null
  let url: URL
  try { url = new URL(baseUrl) } catch { return null }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(instanceName)) return null
  return { baseUrl, apiKey, tenantId, instanceName }
}

export class EvolutionError extends Error {
  constructor(message = 'Não foi possível comunicar com a Evolution API.', public status = 502) { super(message) }
}

export function createEvolutionClient(config: EvolutionConfig, transport: typeof fetch = fetch) {
  async function request(path: string, body?: unknown): Promise<Json | Json[]> {
    try {
      const response = await transport(`${config.baseUrl}${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { apikey: config.apiKey, 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
        redirect: 'error', signal: AbortSignal.timeout(12_000),
      })
      if (!response.ok) throw new EvolutionError(`A Evolution API recusou a operação (HTTP ${response.status}).`, response.status === 404 ? 404 : 502)
      const data = await response.json()
      if (!data || typeof data !== 'object') throw new EvolutionError('Resposta inválida da Evolution API.')
      return data as Json
    } catch (error) {
      if (error instanceof EvolutionError) throw error
      throw new EvolutionError()
    }
  }
  const instance = encodeURIComponent(config.instanceName)
  return {
    request,
    async sendText(number: string, text: string) {
      const data = await request(`/message/sendText/${instance}`, { number: number.replace(/\D/g, ''), text }) as Json
      if (typeof data.key?.id !== 'string' || !data.key.id) throw new EvolutionError('A Evolution API não confirmou o envio.')
      return data.key.id as string
    },
    async status() {
      const data = await request(`/instance/connectionState/${instance}`) as Json
      const state = data.instance?.state
      if (!['open', 'connecting', 'close', 'closed'].includes(state)) throw new EvolutionError('Estado inválido da Evolution API.')
      const instances = await request(`/instance/fetchInstances?instanceName=${instance}`)
      if (!Array.isArray(instances)) throw new EvolutionError('Resposta inválida da Evolution API.')
      const own = instances.find((item) => (item.name ?? item.instance?.instanceName) === config.instanceName)
      const owner = own?.ownerJid ?? own?.instance?.owner
      return { state: state === 'open' ? 'connected' : state === 'connecting' ? 'connecting' : 'disconnected', phone: typeof owner === 'string' ? owner.split('@')[0] : null }
    },
    async connect() {
      let state
      try { state = await this.status() } catch (error) {
        if (!(error instanceof EvolutionError) || error.status !== 404) throw error
        await request('/instance/create', { instanceName: config.instanceName, integration: 'WHATSAPP-BAILEYS', qrcode: true })
      }
      if (state?.state === 'connected') return { ...state, qrCode: null }
      const data = await request(`/instance/connect/${instance}`) as Json
      const base64 = data.base64 ?? data.qrcode?.base64
      const qrCode = typeof base64 === 'string' && /^data:image\/png;base64,[a-zA-Z0-9+/=]+$/.test(base64) && base64.length < 500_000 ? base64 : null
      return { state: 'connecting', phone: null, qrCode }
    },
    async messages() {
      const data = await request(`/chat/findMessages/${instance}`, { where: {}, page: 1, offset: 100 }) as Json
      const records = data.messages?.records ?? (Array.isArray(data.messages) ? data.messages : null)
      if (!Array.isArray(records)) throw new EvolutionError('Lista de mensagens inválida da Evolution API.')
      return records.slice(0, 100) as Json[]
    },
  }
}

export async function sendEvolutionText(tenantId: string, instanceName: string, number: string, text: string) {
  const config = evolutionConfig(tenantId)
  if (!config || config.tenantId !== tenantId || config.instanceName !== instanceName) throw new EvolutionError('Evolution API não configurada para este canal.', 503)
  return createEvolutionClient(config).sendText(number, text)
}

export function registerEvolutionRoutes(app: FastifyInstance, deps: Dependencies) {
  const db = deps.query ?? query
  const transact = deps.query ? async <T>(work: () => Promise<T>) => work() : transaction
  const syncing = new Set<string>()

  async function access(request: FastifyRequest, reply: FastifyReply, manage = false) {
    const user = await deps.requireAuth(request, reply)
    if (!user) return null
    const config = (deps.config ?? evolutionConfig)(user.tenant_id)
    if (!config) { reply.code(503).send({ error: 'Evolution API ainda não configurada para este ambiente.', code: 'evolution_not_configured' }); return null }
    if (config.tenantId !== user.tenant_id || (manage && !deps.canManage(user))) { reply.code(403).send({ error: 'Sem permissão para esta conexão.' }); return null }
    return { config, client: createEvolutionClient(config, deps.fetch) }
  }
  async function channel(config: EvolutionConfig, state: { state: string; phone: string | null }) {
    const result = await db<{ id: string }>(
      `insert into channels(tenant_id,provider,external_id,display_name,phone_number,status,last_sync_at,metadata)
       values($1,'evolution',$2,'WhatsApp Web',$3,$4,now(),'{"source":"evolution-api"}')
       on conflict(tenant_id,provider,external_id) do update set phone_number=coalesce(excluded.phone_number,channels.phone_number),status=excluded.status,metadata=channels.metadata||excluded.metadata,last_sync_at=now(),updated_at=now()
       returning id`, [config.tenantId, config.instanceName, state.phone, state.state],
    )
    return result.rows[0].id
  }
  function failure(reply: FastifyReply, error: unknown) {
    const known = error instanceof EvolutionError ? error : new EvolutionError()
    return reply.code(known.status).send({ error: known.message, code: 'evolution_unavailable' })
  }

  app.get('/api/integrations/evolution/status', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const connection = await access(request, reply)
    if (!connection) return
    try {
      let status
      try { status = await connection.client.status() } catch (error) {
        if (!(error instanceof EvolutionError) || error.status !== 404) throw error
        await db("update channels set status='disconnected',updated_at=now() where tenant_id=$1 and provider='evolution' and external_id=$2", [connection.config.tenantId, connection.config.instanceName])
        return { configured: true, instanceName: connection.config.instanceName, channelId: null, state: 'disconnected', phone: null }
      }
      const channelId = await channel(connection.config, status)
      return { configured: true, instanceName: connection.config.instanceName, channelId, ...status }
    } catch (error) { return failure(reply, error) }
  })

  app.post('/api/integrations/evolution/connect', async (request, reply) => {
    reply.header('Cache-Control', 'no-store')
    const connection = await access(request, reply, true)
    if (!connection) return
    try {
      const status = await connection.client.connect()
      await channel(connection.config, status)
      return { instanceName: connection.config.instanceName, ...status }
    } catch (error) { return failure(reply, error) }
  })

  async function synchronize(config: EvolutionConfig, client: ReturnType<typeof createEvolutionClient>) {
    if (syncing.has(config.tenantId)) throw new EvolutionError('Sincronização já em andamento.', 409)
    syncing.add(config.tenantId)
    try {
      const status = await client.status()
      const channelId = await channel(config, status)
      if (status.state !== 'connected') throw new EvolutionError('Conecte o WhatsApp antes de sincronizar.', 409)
      if (!deps.upsertContact || !deps.conversation) throw new EvolutionError()
      const records = await client.messages()
      let imported = 0
      for (const item of records.reverse()) {
        const jid = item.key?.remoteJid
        const externalId = item.key?.id
        if (typeof jid !== 'string' || !/^\d{8,16}@s\.whatsapp\.net$/.test(jid) || typeof externalId !== 'string') continue
        const exists = await db('select id from messages where tenant_id=$1 and external_id=$2', [config.tenantId, externalId])
        if (exists.rows.length) continue
        const seconds = Number(item.messageTimestamp)
        if (!Number.isFinite(seconds) || seconds < 946684800 || seconds * 1000 > Date.now() + 300_000) continue
        const message = item.message?.ephemeralMessage?.message ?? item.message
        const text = message?.conversation ?? message?.extendedTextMessage?.text ?? message?.imageMessage?.caption ?? message?.videoMessage?.caption
        if (typeof text !== 'string' || !text.trim()) continue
        const phone = jid.split('@')[0]
        const fromMe = item.key.fromMe === true
        const sentAt = new Date(seconds * 1000).toISOString()
        const saved = await transact(async () => {
          const contactId = await deps.upsertContact!(config.tenantId, phone, !fromMe && typeof item.pushName === 'string' ? item.pushName : undefined)
          const conversationId = await deps.conversation!(config.tenantId, channelId, contactId)
          const result = await db(
            `insert into messages(tenant_id,conversation_id,external_id,direction,sender_name,sender_phone,body,message_type,status,sent_at,metadata)
             values($1,$2,$3,$4,$5,$6,$7,'text',$8,$9,'{"source":"evolution-api"}') on conflict(tenant_id,external_id) do nothing returning *`,
            [config.tenantId, conversationId, externalId, fromMe ? 'outbound' : 'inbound', fromMe ? 'WhatsApp Web' : item.pushName ?? phone, fromMe ? status.phone : phone, text.slice(0, 65_000), fromMe ? 'sent' : 'received', sentAt],
          )
          if (!result.rows.length) return null
          const conversation = await db(`update conversations set status=case when $3::timestamptz>=coalesce(last_message_at,$3::timestamptz) then case when $4 then 'open' else 'waiting' end else status end,unread_count=unread_count+case when $4 then 0 else 1 end,last_message_at=greatest(last_message_at,$3::timestamptz),last_customer_message_at=case when $4 then last_customer_message_at else greatest(last_customer_message_at,$3::timestamptz) end,last_agent_message_at=case when $4 then greatest(last_agent_message_at,$3::timestamptz) else last_agent_message_at end,updated_at=now() where tenant_id=$1 and id=$2 returning id,status,unread_count,last_message_at,last_customer_message_at,last_agent_message_at`, [config.tenantId, conversationId, sentAt, fromMe])
          return { conversationId, message: result.rows[0], conversation: conversation.rows[0] }
        })
        if (!saved) continue
        imported++
        deps.publish?.({ type: 'message.created', tenantId: config.tenantId, conversationId: saved.conversationId, data: saved.message })
        deps.publish?.({ type: 'conversation.updated', tenantId: config.tenantId, conversationId: saved.conversationId, data: { ...saved.conversation, id: saved.conversationId, preview: text.slice(0, 200) } })
      }
      return { imported, inspected: records.length }
    } finally { syncing.delete(config.tenantId) }
  }

  app.post('/api/integrations/evolution/sync', async (request, reply) => {
    const connection = await access(request, reply, true)
    if (!connection) return
    try { return await synchronize(connection.config, connection.client) } catch (error) { return failure(reply, error) }
  })

  if (deps.background === true && process.env.EVOLUTION_SYNC_ENABLED === 'true') {
    let running = false
    const timer = setInterval(async () => {
      if (running) return
      running = true
      try {
        const channels = await db<{ tenant_id: string; external_id: string }>("select tenant_id,external_id from channels where provider='evolution' and status in ('connected','connecting','disconnected') and metadata->>'source'='evolution-api' order by last_sync_at nulls first limit 50")
        for (const channel of channels.rows) {
          const config = (deps.config ?? evolutionConfig)(channel.tenant_id)
          if (!config || config.instanceName !== channel.external_id) continue
          try { await synchronize(config, createEvolutionClient(config, deps.fetch)) } catch { app.log.info('Evolution: sincronização adiada; conexão indisponível.') }
        }
      } catch { app.log.info('Evolution: não foi possível consultar os canais para sincronizar.') }
      finally { running = false }
    }, 15_000)
    timer.unref()
    app.addHook('onClose', async () => { clearInterval(timer) })
  }
}

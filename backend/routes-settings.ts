import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'
import { query } from './db.js'

type UserSession = {
  id: string
  tenant_id: string
  name: string
  email: string
  role: string
}

type RequireAuth = (req: FastifyRequest, reply: FastifyReply) => Promise<UserSession | null | undefined>
type RecordEvent = (
  tenantId: string,
  entityType: string,
  eventType: string,
  payload: Record<string, unknown>,
  actorUserId?: string,
  entityId?: string,
  requestId?: string,
) => Promise<void>

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
  type: string
  content: string
  active: boolean
  times_used: number
  created_at: string
  updated_at: string
}

const updateSettingsSchema = z.object({
  workspace_name: z.string().trim().min(1).optional(),
  cnpj: z.string().trim().nullable().optional(),
  phone: z.string().trim().nullable().optional(),
  email: z.string().trim().email().nullable().optional(),
  address: z.string().trim().nullable().optional(),
  timezone: z.string().trim().optional(),
  currency: z.string().trim().optional(),
  business_hours: z.object({
    enabled: z.boolean(),
    start: z.string(),
    end: z.string(),
    days: z.array(z.number()),
  }).optional(),
  welcome_message: z.string().trim().nullable().optional(),
  away_message: z.string().trim().nullable().optional(),
  auto_assign: z.boolean().optional(),
  sla_minutes: z.number().int().min(1).max(1440).optional(),
  ai_copilot_enabled: z.boolean().optional(),
  ai_autonomous_reply: z.boolean().optional(),
  ai_tone: z.string().trim().optional(),
  ai_custom_instructions: z.string().trim().nullable().optional(),
})

const createKnowledgeSchema = z.object({
  title: z.string().trim().min(1),
  type: z.enum(['faq', 'document', 'url', 'guideline']).default('faq'),
  content: z.string().trim().min(1),
})

const updateKnowledgeSchema = z.object({
  title: z.string().trim().min(1).optional(),
  type: z.enum(['faq', 'document', 'url', 'guideline']).optional(),
  content: z.string().trim().min(1).optional(),
  active: z.boolean().optional(),
})

/**
 * Configuração da área de trabalho vale para a empresa inteira: só
 * administrador e gerente mudam. Ler continua aberto — o atendente precisa ver
 * o horário de atendimento e a mensagem de boas-vindas que está valendo.
 */
function podeAdministrar(user: UserSession) {
  return user.role === 'admin' || user.role === 'gerente' || user.role === 'manager'
}

export function registerSettingsRoutes(
  app: FastifyInstance,
  requireAuth: RequireAuth,
  recordEvent: RecordEvent,
) {
  // ── GET /api/settings ───────────────────────────────────────────────────────
  app.get('/api/settings', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    let result = await query<TenantSettings>(
      'select * from tenant_settings where tenant_id = $1',
      [user.tenant_id],
    )

    if (result.rows.length === 0) {
      result = await query<TenantSettings>(
        `insert into tenant_settings (tenant_id)
         values ($1)
         on conflict (tenant_id) do update set updated_at = now()
         returning *`,
        [user.tenant_id],
      )
    }

    return { settings: result.rows[0] }
  })

  // ── PATCH /api/settings ─────────────────────────────────────────────────────
  app.patch('/api/settings', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!podeAdministrar(user)) return reply.code(403).send({ error: 'Permissao insuficiente.' })

    const body = updateSettingsSchema.parse(request.body)

    const updated = await query<TenantSettings>(
      `insert into tenant_settings (
        tenant_id, workspace_name, cnpj, phone, email, address, timezone, currency,
        business_hours, welcome_message, away_message, auto_assign, sla_minutes,
        ai_copilot_enabled, ai_autonomous_reply, ai_tone, ai_custom_instructions, updated_at
      ) values (
        $1,
        coalesce($2, 'Ávila Ops Workspace'),
        $3, $4, $5, $6,
        coalesce($7, 'America/Sao_Paulo'),
        coalesce($8, 'BRL'),
        coalesce($9::jsonb, '{"enabled": true, "start": "08:00", "end": "18:00", "days": [1,2,3,4,5]}'::jsonb),
        $10, $11,
        coalesce($12, true),
        coalesce($13, 15),
        coalesce($14, true),
        coalesce($15, false),
        coalesce($16, 'consultivo'),
        $17,
        now()
      )
      on conflict (tenant_id) do update set
        workspace_name = coalesce($2, tenant_settings.workspace_name),
        cnpj = case when $18::boolean then $3 else tenant_settings.cnpj end,
        phone = case when $19::boolean then $4 else tenant_settings.phone end,
        email = case when $20::boolean then $5 else tenant_settings.email end,
        address = case when $21::boolean then $6 else tenant_settings.address end,
        timezone = coalesce($7, tenant_settings.timezone),
        currency = coalesce($8, tenant_settings.currency),
        business_hours = case when $22::boolean then $9::jsonb else tenant_settings.business_hours end,
        welcome_message = case when $23::boolean then $10 else tenant_settings.welcome_message end,
        away_message = case when $24::boolean then $11 else tenant_settings.away_message end,
        auto_assign = coalesce($12, tenant_settings.auto_assign),
        sla_minutes = coalesce($13, tenant_settings.sla_minutes),
        ai_copilot_enabled = coalesce($14, tenant_settings.ai_copilot_enabled),
        ai_autonomous_reply = coalesce($15, tenant_settings.ai_autonomous_reply),
        ai_tone = coalesce($16, tenant_settings.ai_tone),
        ai_custom_instructions = case when $25::boolean then $17 else tenant_settings.ai_custom_instructions end,
        updated_at = now()
      returning *`,
      [
        user.tenant_id,
        body.workspace_name ?? null,
        body.cnpj ?? null,
        body.phone ?? null,
        body.email ?? null,
        body.address ?? null,
        body.timezone ?? null,
        body.currency ?? null,
        body.business_hours ? JSON.stringify(body.business_hours) : null,
        body.welcome_message ?? null,
        body.away_message ?? null,
        body.auto_assign !== undefined ? body.auto_assign : null,
        body.sla_minutes ?? null,
        body.ai_copilot_enabled !== undefined ? body.ai_copilot_enabled : null,
        body.ai_autonomous_reply !== undefined ? body.ai_autonomous_reply : null,
        body.ai_tone ?? null,
        body.ai_custom_instructions ?? null,
        body.cnpj !== undefined,
        body.phone !== undefined,
        body.email !== undefined,
        body.address !== undefined,
        body.business_hours !== undefined,
        body.welcome_message !== undefined,
        body.away_message !== undefined,
        body.ai_custom_instructions !== undefined,
      ],
    )

    await recordEvent(
      user.tenant_id,
      'settings',
      'settings.updated',
      { fields: Object.keys(body) },
      user.id,
      user.tenant_id,
      (request as unknown as { requestId?: string }).requestId,
    )

    return { settings: updated.rows[0] }
  })

  // ── GET /api/knowledge ──────────────────────────────────────────────────────
  app.get('/api/knowledge', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return

    const result = await query<KnowledgeSource>(
      `select * from knowledge_sources
       where tenant_id = $1
       order by created_at desc`,
      [user.tenant_id],
    )

    return { sources: result.rows }
  })

  // ── POST /api/knowledge ─────────────────────────────────────────────────────
  app.post('/api/knowledge', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!podeAdministrar(user)) return reply.code(403).send({ error: 'Permissao insuficiente.' })

    const body = createKnowledgeSchema.parse(request.body)

    const result = await query<KnowledgeSource>(
      `insert into knowledge_sources (tenant_id, title, type, content, active, times_used, updated_at)
       values ($1, $2, $3, $4, true, 0, now())
       returning *`,
      [user.tenant_id, body.title, body.type, body.content],
    )

    const source = result.rows[0]
    await recordEvent(
      user.tenant_id,
      'knowledge',
      'knowledge.created',
      { title: body.title, type: body.type },
      user.id,
      source.id,
      (request as unknown as { requestId?: string }).requestId,
    )

    return reply.code(201).send({ source })
  })

  // ── PATCH /api/knowledge/:id ────────────────────────────────────────────────
  app.patch('/api/knowledge/:id', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!podeAdministrar(user)) return reply.code(403).send({ error: 'Permissao insuficiente.' })

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const body = updateKnowledgeSchema.parse(request.body)

    const result = await query<KnowledgeSource>(
      `update knowledge_sources
       set title = coalesce($3, title),
           type = coalesce($4, type),
           content = coalesce($5, content),
           active = coalesce($6, active),
           updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [
        user.tenant_id,
        id,
        body.title ?? null,
        body.type ?? null,
        body.content ?? null,
        body.active !== undefined ? body.active : null,
      ],
    )

    if (!result.rows[0]) return reply.code(404).send({ error: 'Fonte de conhecimento não encontrada.' })

    await recordEvent(
      user.tenant_id,
      'knowledge',
      'knowledge.updated',
      { fields: Object.keys(body) },
      user.id,
      id,
      (request as unknown as { requestId?: string }).requestId,
    )

    return { source: result.rows[0] }
  })

  // ── DELETE /api/knowledge/:id ───────────────────────────────────────────────
  app.delete('/api/knowledge/:id', async (request, reply) => {
    const user = await requireAuth(request, reply)
    if (!user) return
    if (!podeAdministrar(user)) return reply.code(403).send({ error: 'Permissao insuficiente.' })

    const { id } = z.object({ id: z.string().uuid() }).parse(request.params)
    const result = await query(
      'delete from knowledge_sources where tenant_id = $1 and id = $2 returning id',
      [user.tenant_id, id],
    )

    if (!result.rows[0]) return reply.code(404).send({ error: 'Fonte não encontrada.' })

    await recordEvent(
      user.tenant_id,
      'knowledge',
      'knowledge.deleted',
      {},
      user.id,
      id,
      (request as unknown as { requestId?: string }).requestId,
    )

    return { ok: true }
  })
}

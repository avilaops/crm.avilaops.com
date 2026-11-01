import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import { z } from 'zod'

const statusSchema = z.object({
  connected: z.boolean(),
  account: z.object({ id: z.string().nullable(), username: z.string().nullable(), expiresAt: z.string().nullable(), checkedAt: z.string().nullable() }).nullable(),
  capabilities: z.object({ publish: z.boolean(), insights: z.boolean() }),
})
const insightsSchema = z.object({
  since: z.string(), until: z.string(), readAt: z.string(),
  metrics: z.array(z.object({ name: z.string(), period: z.string().nullable(), total: z.number().nullable(),
    values: z.array(z.object({ value: z.number(), endTime: z.string().nullable() })) })),
})
type Dependencies = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<{ tenant_id: string } | null | undefined>
  fetch?: typeof fetch
}

/** O tenant vem exclusivamente da sessão. A correspondência com a empresa é autorizada no Hub. */
export function registerThreadsRoutes(app: FastifyInstance, deps: Dependencies) {
  for (const insights of [false, true]) {
    app.get(`/api/integrations/threads/${insights ? 'insights' : 'status'}`, async (request, reply) => {
      const user = await deps.requireAuth(request, reply)
      if (!user) return
      reply.header('Cache-Control', 'no-store')
      const token = process.env.CRM_THREADS_API_TOKEN
      if (!token || token.length < 32) return reply.code(503).send({ error: 'A integração Threads ainda não foi configurada.', code: 'threads_not_configured' })
      try {
        // Origem fixa: o chamador não pode enviar uma URL que receba a credencial do serviço.
        const url = new URL('https://app.avilaops.com/api/internal/threads')
        url.searchParams.set('tenant', user.tenant_id)
        if (insights) url.searchParams.set('insights', '1')
        const response = await (deps.fetch ?? fetch)(url, { headers: { Authorization: `Bearer ${token}` },
          redirect: 'error', signal: AbortSignal.timeout(25000) })
        if (response.status === 403) return reply.code(403).send({ error: 'O Threads não está habilitado para esta empresa.', code: 'threads_company_not_authorized' })
        if (!response.ok) throw new Error('upstream')
        const schema = insights ? statusSchema.extend({ insights: insightsSchema }) : statusSchema
        // A lista explícita de campos também impede repassar credenciais adicionadas pelo provedor.
        return schema.parse(await response.json())
      } catch {
        return reply.code(502).send({ error: 'Não foi possível consultar o Threads. Tente novamente.', code: 'threads_unavailable' })
      }
    })
  }
}

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

type Dependencies = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: Record<string, unknown>,
    actorUserId?: string | null,
    entityId?: string | null,
    requestId?: string | null,
  ) => Promise<void>;
};

export type Segment = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  rules: {
    tags?: string[];
    source?: string;
    newsletter_status?: string;
    has_phone?: boolean;
    has_email?: boolean;
    search?: string;
  };
  created_at: string;
  updated_at: string;
};

const SegmentInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  description: z.string().trim().max(1000).nullable().optional(),
  rules: z
    .object({
      tags: z.array(z.string()).optional(),
      source: z.string().optional(),
      newsletter_status: z.string().optional(),
      has_phone: z.boolean().optional(),
      has_email: z.boolean().optional(),
      search: z.string().optional(),
    })
    .default({}),
});

export function registerSegmentRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, recordEvent } = deps;

  // Listar segmentos com contagem de contatos em cada
  app.get("/api/segments", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const result = await query<Segment>(
      `select * from segments where tenant_id = $1 order by name asc`,
      [user.tenant_id],
    );

    return { segments: result.rows };
  });

  // Criar segmento
  app.post("/api/segments", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parsed = SegmentInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const result = await query<Segment>(
      `insert into segments (tenant_id, name, description, rules)
       values ($1, $2, $3, $4::jsonb)
       returning *`,
      [user.tenant_id, data.name, data.description ?? null, JSON.stringify(data.rules)],
    );

    const segment = result.rows[0];
    await recordEvent(user.tenant_id, "segment", "segment_created", { segment_id: segment.id, name: segment.name }, user.id, segment.id);

    reply.code(201).send({ segment });
  });

  // Buscar contatos pertencentes a um segmento
  app.get("/api/segments/:id/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID inválido." });
      return;
    }

    const segmentRes = await query<Segment>("select * from segments where id = $1 and tenant_id = $2", [
      paramsParsed.data.id,
      user.tenant_id,
    ]);

    if (!segmentRes.rows[0]) {
      reply.code(404).send({ error: "Segmento não encontrado." });
      return;
    }

    const segment = segmentRes.rows[0];
    const rules = segment.rules ?? {};

    const conditions: string[] = ["c.tenant_id = $1"];
    const params: unknown[] = [user.tenant_id];

    if (rules.tags && rules.tags.length > 0) {
      params.push(rules.tags);
      conditions.push(`c.tags && $${params.length}::text[]`);
    }

    if (rules.source && rules.source.trim()) {
      params.push(rules.source.trim());
      conditions.push(`c.source = $${params.length}`);
    }

    if (rules.newsletter_status && rules.newsletter_status.trim()) {
      params.push(rules.newsletter_status.trim());
      conditions.push(`c.newsletter_status = $${params.length}`);
    }

    if (rules.has_phone === true) {
      conditions.push("c.phone is not null and c.phone <> ''");
    }

    if (rules.has_email === true) {
      conditions.push("c.email is not null and c.email <> ''");
    }

    if (rules.search && rules.search.trim()) {
      params.push(`%${rules.search.trim().toLowerCase()}%`);
      conditions.push(`(lower(c.name) like $${params.length} or lower(c.email) like $${params.length} or lower(c.phone) like $${params.length})`);
    }

    const whereClause = conditions.join(" and ");

    const contactsResult = await query(
      `select c.id, c.name, c.email, c.phone, c.company, c.source, c.tags, c.newsletter_status, c.updated_at
       from contacts c
       where ${whereClause}
       order by c.name asc
       limit 100`,
      params,
    );

    return {
      segment,
      contacts: contactsResult.rows,
      totalCount: contactsResult.rowCount,
    };
  });

  // Excluir segmento
  app.delete("/api/segments/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID inválido." });
      return;
    }

    const result = await query<{ id: string; name: string }>(
      `delete from segments where id = $1 and tenant_id = $2 returning id, name`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!result.rows[0]) {
      reply.code(404).send({ error: "Segmento não encontrado." });
      return;
    }

    await recordEvent(user.tenant_id, "segment", "segment_deleted", { segment_id: result.rows[0].id }, user.id, result.rows[0].id);

    return { success: true };
  });
}


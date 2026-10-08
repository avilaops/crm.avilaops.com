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

export type MediaFile = {
  id: string;
  tenant_id: string;
  name: string;
  file_type: string;
  file_size_bytes: string | number;
  url: string;
  category: string;
  created_at: string;
};

const MediaInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  file_type: z.enum(["pdf", "image", "document", "spreadsheet", "video", "audio"]).default("document"),
  file_size_bytes: z.number().int().min(0).default(0),
  url: z.string().trim().min(1).max(2000),
  category: z.string().trim().max(100).default("Geral"),
});

export function registerMediaRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, recordEvent } = deps;

  // Listar arquivos de mídia
  app.get("/api/media", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const schema = z.object({
      search: z.string().optional(),
      category: z.string().optional(),
      file_type: z.string().optional(),
    });

    const parsed = schema.safeParse(request.query);
    if (!parsed.success) {
      reply.code(400).send({ error: "Parâmetros inválidos." });
      return;
    }

    const { search, category, file_type } = parsed.data;

    const conditions: string[] = ["tenant_id = $1"];
    const params: unknown[] = [user.tenant_id];

    if (search && search.trim()) {
      params.push(`%${search.trim().toLowerCase()}%`);
      conditions.push(`lower(name) like $${params.length}`);
    }

    if (category && category.trim()) {
      params.push(category.trim());
      conditions.push(`category = $${params.length}`);
    }

    if (file_type && file_type.trim()) {
      params.push(file_type.trim());
      conditions.push(`file_type = $${params.length}`);
    }

    const whereClause = conditions.join(" and ");

    const [mediaResult, categoriesResult] = await Promise.all([
      query<MediaFile>(`select * from media_files where ${whereClause} order by created_at desc`, params),
      query<{ category: string; total: string }>(
        `select category, count(*)::text as total from media_files where tenant_id = $1 group by category order by category asc`,
        [user.tenant_id],
      ),
    ]);

    return {
      files: mediaResult.rows,
      categories: categoriesResult.rows.map((r) => ({ name: r.category, total: Number(r.total) })),
      total: mediaResult.rowCount,
    };
  });

  // Cadastrar novo arquivo / link de mídia
  app.post("/api/media", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parsed = MediaInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const result = await query<MediaFile>(
      `insert into media_files (tenant_id, name, file_type, file_size_bytes, url, category)
       values ($1, $2, $3, $4, $5, $6)
       returning *`,
      [user.tenant_id, data.name, data.file_type, data.file_size_bytes, data.url, data.category],
    );

    const media = result.rows[0];
    await recordEvent(user.tenant_id, "media", "media_uploaded", { media_id: media.id, name: media.name }, user.id, media.id);

    reply.code(201).send({ file: media });
  });

  // Excluir arquivo
  app.delete("/api/media/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID inválido." });
      return;
    }

    const result = await query<{ id: string; name: string }>(
      `delete from media_files where id = $1 and tenant_id = $2 returning id, name`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!result.rows[0]) {
      reply.code(404).send({ error: "Arquivo não encontrado." });
      return;
    }

    await recordEvent(user.tenant_id, "media", "media_deleted", { media_id: result.rows[0].id }, user.id, result.rows[0].id);

    return { success: true };
  });
}


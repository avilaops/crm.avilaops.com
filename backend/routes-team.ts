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

export type TeamChannel = {
  id: string;
  tenant_id: string;
  name: string;
  description: string | null;
  is_default: boolean;
  created_at: string;
};

export type TeamMessage = {
  id: string;
  tenant_id: string;
  channel_id: string;
  user_id: string | null;
  user_name: string;
  body: string;
  created_at: string;
};

export function registerTeamRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, recordEvent } = deps;

  // Listar canais da equipe
  app.get("/api/team/channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const result = await query<TeamChannel>(
      `select * from team_channels where tenant_id = $1 order by is_default desc, name asc`,
      [user.tenant_id],
    );

    return { channels: result.rows };
  });

  // Criar canal da equipe
  app.post("/api/team/channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const schema = z.object({
      name: z.string().trim().min(1).max(100),
      description: z.string().trim().max(500).optional(),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const { name, description } = parsed.data;
    const result = await query<TeamChannel>(
      `insert into team_channels (tenant_id, name, description)
       values ($1, $2, $3)
       returning *`,
      [user.tenant_id, name, description ?? null],
    );

    const channel = result.rows[0];
    await recordEvent(user.tenant_id, "team", "channel_created", { channel_id: channel.id, name: channel.name }, user.id, channel.id);

    reply.code(201).send({ channel });
  });

  // Listar mensagens de um canal
  app.get("/api/team/channels/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de canal inválido." });
      return;
    }

    const channelResult = await query<TeamChannel>(
      `select * from team_channels where id = $1 and tenant_id = $2`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!channelResult.rows[0]) {
      reply.code(404).send({ error: "Canal não encontrado." });
      return;
    }

    const messagesResult = await query<TeamMessage>(
      `select * from team_messages where channel_id = $1 and tenant_id = $2 order by created_at asc limit 200`,
      [paramsParsed.data.id, user.tenant_id],
    );

    return {
      channel: channelResult.rows[0],
      messages: messagesResult.rows,
    };
  });

  // Enviar mensagem no canal da equipe
  app.post("/api/team/channels/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de canal inválido." });
      return;
    }

    const bodySchema = z.object({
      body: z.string().trim().min(1).max(5000),
    });

    const bodyParsed = bodySchema.safeParse(request.body);
    if (!bodyParsed.success) {
      reply.code(400).send({ error: "Mensagem não pode ser vazia." });
      return;
    }

    const channel = (
      await query<TeamChannel>("select * from team_channels where id = $1 and tenant_id = $2", [
        paramsParsed.data.id,
        user.tenant_id,
      ])
    ).rows[0];

    if (!channel) {
      reply.code(404).send({ error: "Canal não encontrado." });
      return;
    }

    const result = await query<TeamMessage>(
      `insert into team_messages (tenant_id, channel_id, user_id, user_name, body)
       values ($1, $2, $3, $4, $5)
       returning *`,
      [user.tenant_id, channel.id, user.id, user.name, bodyParsed.data.body],
    );

    const message = result.rows[0];

    return { message };
  });
}


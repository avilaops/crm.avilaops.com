import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";

/**
 * "Minha conta": o que cada pessoa muda sobre si mesma.
 *
 * Até aqui só um administrador alterava nome e senha, pela gestão de usuários —
 * o atendente que quisesse trocar a própria senha precisava pedir a alguém. E a
 * tela de perfil mostrava dados escritos à mão no código, iguais para todos.
 *
 * Nada aqui mexe em papel, status ou e-mail: isso continua sendo decisão de
 * quem administra a área de trabalho, em `PATCH /api/users/:id`.
 */

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

type RequestWithId = FastifyRequest & { requestId?: string };

export type AccountRouteDeps = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: unknown,
    actorUserId?: string | null,
    entityId?: string | null,
    requestId?: string | null,
  ) => Promise<void>;
  /** Hash do token da sessão deste pedido: separa "esta sessão" das outras. */
  currentSessionHash: (request: FastifyRequest) => string | null;
};

const perfilSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
});

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRouteDeps) {
  app.get("/api/me", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    return { user };
  });

  app.patch("/api/me", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const parsed = perfilSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Dados invalidos." });

    const result = await query<AuthUser>(
      `update users set name = $3
       where tenant_id = $1 and id = $2
       returning id, tenant_id, name, email, role`,
      [user.tenant_id, user.id, parsed.data.name],
    );
    await deps.recordEvent(user.tenant_id, "user", "user.profile_updated", { fields: ["name"] }, user.id, user.id, (request as RequestWithId).requestId);
    return { user: result.rows[0] };
  });

  app.get("/api/me/sessions", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const atualHash = deps.currentSessionHash(request);
    // O hash do token não sai daqui: a tela só precisa saber qual é a atual.
    const result = await query<{ id: string; created_at: string; last_seen_at: string; expires_at: string; current: boolean }>(
      `select id, created_at, last_seen_at, expires_at, token_hash = $2 as current
       from sessions
       where user_id = $1 and expires_at > now()
       order by last_seen_at desc`,
      [user.id, atualHash],
    );
    return { sessions: result.rows };
  });

  app.post("/api/me/sessions/revoke-others", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const atualHash = deps.currentSessionHash(request);
    if (!atualHash) return reply.code(400).send({ error: "Sessao atual nao identificada." });
    const result = await query("delete from sessions where user_id = $1 and token_hash <> $2", [user.id, atualHash]);
    await deps.recordEvent(user.tenant_id, "auth", "user.sessions_revoked", { closed: result.rowCount ?? 0 }, user.id, user.id, (request as RequestWithId).requestId);
    return { ok: true, closed: result.rowCount ?? 0 };
  });
}

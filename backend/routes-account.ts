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
  hashPassword: (password: string) => Promise<string>;
  verifyPassword: (password: string, stored: string | null) => Promise<boolean>;
  /** Hash do token da sessão deste pedido: separa "esta sessão" das outras. */
  currentSessionHash: (request: FastifyRequest) => string | null;
  checkRateLimit: (key: string, limit: number, windowMs: number) => boolean;
};

const perfilSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
});

const senhaSchema = z.object({
  currentPassword: z.string().min(1, "Informe a senha atual."),
  newPassword: z.string().min(8, "A nova senha precisa de pelo menos 8 caracteres.").max(200),
});

export function registerAccountRoutes(app: FastifyInstance, deps: AccountRouteDeps) {
  app.get("/api/me", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const result = await query<{ has_password: boolean }>(
      "select password_hash is not null as has_password from users where tenant_id = $1 and id = $2",
      [user.tenant_id, user.id],
    );
    // Quem só entra pelo SSO não tem senha aqui: a tela explica em vez de pedir
    // uma "senha atual" que não existe.
    return { user, hasPassword: Boolean(result.rows[0]?.has_password) };
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

  app.post("/api/me/password", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    // Por pessoa e por IP: quem roubou uma sessão aberta não testa senhas à vontade.
    if (!deps.checkRateLimit(`senha:${user.id}`, 5, 15 * 60 * 1000) || !deps.checkRateLimit(`senha-ip:${request.ip}`, 10, 15 * 60 * 1000)) {
      return reply.code(429).send({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
    }
    const parsed = senhaSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: parsed.error.issues[0]?.message ?? "Dados invalidos." });

    const atual = await query<{ password_hash: string | null }>(
      "select password_hash from users where tenant_id = $1 and id = $2",
      [user.tenant_id, user.id],
    );
    const hash = atual.rows[0]?.password_hash ?? null;
    if (!hash) return reply.code(400).send({ error: "Sua conta entra pela conta Avila Ops e nao tem senha propria aqui." });
    if (!(await deps.verifyPassword(parsed.data.currentPassword, hash))) {
      await deps.recordEvent(user.tenant_id, "auth", "user.password_change_failed", {}, user.id, user.id, (request as RequestWithId).requestId);
      return reply.code(400).send({ error: "A senha atual nao confere." });
    }
    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return reply.code(400).send({ error: "A nova senha precisa ser diferente da atual." });
    }

    await query("update users set password_hash = $3 where tenant_id = $1 and id = $2", [
      user.tenant_id,
      user.id,
      await deps.hashPassword(parsed.data.newPassword),
    ]);

    // Trocou a senha porque desconfiou de alguém: as outras sessões caem junto.
    // Esta continua, para a pessoa não ser jogada para fora no meio da tela.
    const atualHash = deps.currentSessionHash(request);
    const encerradas = await query(
      "delete from sessions where user_id = $1 and ($2::text is null or token_hash <> $2)",
      [user.id, atualHash],
    );
    await deps.recordEvent(
      user.tenant_id,
      "auth",
      "user.password_changed",
      { other_sessions_closed: encerradas.rowCount ?? 0 },
      user.id,
      user.id,
      (request as RequestWithId).requestId,
    );
    return { ok: true, otherSessionsClosed: encerradas.rowCount ?? 0 };
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

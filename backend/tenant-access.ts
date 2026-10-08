import type { FastifyInstance } from "fastify";
import { query } from "./db.js";

// These identifiers are code-owned, never supplied by the caller.
const references: Record<string, string> = {
  contact_id: "contacts", contactId: "contacts", company_id: "companies",
  lead_id: "leads", leadId: "leads", assigned_user_id: "users",
  assignedUserId: "users", userId: "users", conversationId: "conversations",
  conversation_id: "conversations", channelId: "channels", channel_id: "channels",
};

export async function validateTenantReferences(tenantId: string, body: Record<string, unknown>) {
  for (const [field, table] of Object.entries(references)) {
    const value = body[field];
    if (value === undefined || value === null || value === "") continue;
    const result = await query(`select id from ${table} where tenant_id = $1 and id::text = $2`, [tenantId, String(value)]);
    if (!result.rowCount) throw Object.assign(new Error("Vinculo invalido para esta empresa."), { statusCode: 400 });
  }
  const stage = body.stageId ?? body.stage_id;
  if (stage) {
    const result = await query("select s.id from pipeline_stages s join pipelines p on p.id = s.pipeline_id where p.tenant_id = $1 and s.id::text = $2", [tenantId, String(stage)]);
    if (!result.rowCount) throw Object.assign(new Error("Etapa invalida para esta empresa."), { statusCode: 400 });
  }
}

export function installErrorHandler(app: FastifyInstance) {
  app.setErrorHandler((error, request, reply) => {
    const err = error as Error & { code?: string; statusCode?: number; issues?: unknown };
    const status = err.name === "ZodError" || err.code === "22P02" || err.code === "23503" ? 400
      : err.code === "23505" ? 409 : err.statusCode ?? 500;
    if (status >= 500) request.log.error({ err, requestId: request.id }, "Falha na operacao CRM");
    reply.code(status).send({ error: status >= 500 ? "Nao foi possivel concluir a operacao." : status === 409 ? "Registro duplicado ou alterado por outra pessoa." : err.name === "ZodError" ? "Confira os campos informados." : err.message, requestId: request.id });
  });
}

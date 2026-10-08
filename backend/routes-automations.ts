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

export type AutomationRule = {
  id: string;
  tenant_id: string;
  name: string;
  trigger_type: string;
  conditions: Record<string, unknown>;
  action_type: string;
  action_payload: Record<string, unknown>;
  active: boolean;
  runs_count: number;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

const AutomationInputSchema = z.object({
  name: z.string().trim().min(1).max(255),
  trigger_type: z.enum(["stage_change", "message_received", "contact_created", "task_overdue"]),
  conditions: z.record(z.string(), z.unknown()).default({}),
  action_type: z.enum(["send_whatsapp", "n8n_webhook", "create_task", "notify_team"]),
  action_payload: z.record(z.string(), z.unknown()).default({}),
  active: z.boolean().default(true),
});

export function registerAutomationRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, recordEvent } = deps;

  // Listar automações
  app.get("/api/automations", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const result = await query<AutomationRule>(
      `select * from automation_rules where tenant_id = $1 order by created_at desc`,
      [user.tenant_id],
    );

    return { automations: result.rows };
  });

  // Criar automação
  app.post("/api/automations", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const parsed = AutomationInputSchema.safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const data = parsed.data;
    const result = await query<AutomationRule>(
      `insert into automation_rules (tenant_id, name, trigger_type, conditions, action_type, action_payload, active)
       values ($1, $2, $3, $4::jsonb, $5, $6::jsonb, $7)
       returning *`,
      [
        user.tenant_id,
        data.name,
        data.trigger_type,
        JSON.stringify(data.conditions),
        data.action_type,
        JSON.stringify(data.action_payload),
        data.active,
      ],
    );

    const rule = result.rows[0];
    await recordEvent(user.tenant_id, "automation", "automation_created", { rule_id: rule.id, name: rule.name }, user.id, rule.id);

    reply.code(201).send({ automation: rule });
  });

  // Atualizar automação
  app.put("/api/automations/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de automação inválido." });
      return;
    }

    const parsed = AutomationInputSchema.partial().safeParse(request.body);
    if (!parsed.success) {
      reply.code(400).send({ error: "Dados inválidos.", details: parsed.error.issues });
      return;
    }

    const existing = await query<AutomationRule>("select * from automation_rules where id = $1 and tenant_id = $2", [
      paramsParsed.data.id,
      user.tenant_id,
    ]);

    if (!existing.rows[0]) {
      reply.code(404).send({ error: "Regra de automação não encontrada." });
      return;
    }

    const data = parsed.data;

    const updated = await query<AutomationRule>(
      `update automation_rules
       set name = coalesce($3, name),
           trigger_type = coalesce($4, trigger_type),
           conditions = coalesce($5::jsonb, conditions),
           action_type = coalesce($6, action_type),
           action_payload = coalesce($7::jsonb, action_payload),
           active = coalesce($8, active),
           updated_at = now()
       where id = $1 and tenant_id = $2
       returning *`,
      [
        paramsParsed.data.id,
        user.tenant_id,
        data.name,
        data.trigger_type,
        data.conditions ? JSON.stringify(data.conditions) : null,
        data.action_type,
        data.action_payload ? JSON.stringify(data.action_payload) : null,
        data.active,
      ],
    );

    const rule = updated.rows[0];
    await recordEvent(user.tenant_id, "automation", "automation_updated", { rule_id: rule.id, name: rule.name }, user.id, rule.id);

    return { automation: rule };
  });

  // Alternar ativo/inativo
  app.post("/api/automations/:id/toggle", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de automação inválido." });
      return;
    }

    const updated = await query<AutomationRule>(
      `update automation_rules
       set active = not active, updated_at = now()
       where id = $1 and tenant_id = $2
       returning *`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!updated.rows[0]) {
      reply.code(404).send({ error: "Regra não encontrada." });
      return;
    }

    return { automation: updated.rows[0] };
  });

  // Testar execução manual da automação
  app.post("/api/automations/:id/test", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID inválido." });
      return;
    }

    const rule = (
      await query<AutomationRule>("select * from automation_rules where id = $1 and tenant_id = $2", [
        paramsParsed.data.id,
        user.tenant_id,
      ])
    ).rows[0];

    if (!rule) {
      reply.code(404).send({ error: "Regra não encontrada." });
      return;
    }

    // Executa simulação ou chamada real
    let executionResult: { success: boolean; detail: string; response?: unknown } = {
      success: true,
      detail: `Teste da ação '${rule.action_type}' simulado com sucesso.`,
    };

    if (rule.action_type === "n8n_webhook" && typeof rule.action_payload?.webhook_url === "string") {
      try {
        const testPayload = {
          event: "crm.automation.test",
          rule_id: rule.id,
          rule_name: rule.name,
          timestamp: new Date().toISOString(),
          tenant_id: user.tenant_id,
          user: { name: user.name, email: user.email },
        };
        const res = await fetch(rule.action_payload.webhook_url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(testPayload),
        });
        executionResult = {
          success: res.ok,
          detail: `Webhook n8n disparado com status HTTP ${res.status}.`,
        };
      } catch (err: unknown) {
        executionResult = {
          success: false,
          detail: `Falha ao alcançar o webhook: ${err instanceof Error ? err.message : String(err)}`,
        };
      }
    }

    await query(
      `update automation_rules set runs_count = runs_count + 1, last_run_at = now() where id = $1`,
      [rule.id],
    );

    await recordEvent(
      user.tenant_id,
      "automation",
      "automation_tested",
      { rule_id: rule.id, result: executionResult },
      user.id,
      rule.id,
    );

    return { result: executionResult };
  });

  // Excluir automação
  app.delete("/api/automations/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const paramsSchema = z.object({ id: z.string().uuid() });
    const paramsParsed = paramsSchema.safeParse(request.params);
    if (!paramsParsed.success) {
      reply.code(400).send({ error: "ID de automação inválido." });
      return;
    }

    const result = await query<{ id: string; name: string }>(
      `delete from automation_rules where id = $1 and tenant_id = $2 returning id, name`,
      [paramsParsed.data.id, user.tenant_id],
    );

    if (!result.rows[0]) {
      reply.code(404).send({ error: "Regra de automação não encontrada." });
      return;
    }

    await recordEvent(user.tenant_id, "automation", "automation_deleted", { rule_id: result.rows[0].id }, user.id, result.rows[0].id);

    return { success: true };
  });
}

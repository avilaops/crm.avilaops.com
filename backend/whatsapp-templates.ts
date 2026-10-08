import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";
import { publishRealtimeAsync } from "./realtime.js";
import { enviar as enviarPelaMessageria, getConnection as conexaoMessageria, listarModelos, MessageriaRequestError } from "./messageria.js";

/**
 * Templates aprovados na Meta e a janela de atendimento de 24 horas.
 *
 * A regra da plataforma: texto livre so sai enquanto a ultima mensagem do
 * cliente tiver menos de 24 horas. Passou disso, a unica saida e um template
 * aprovado. Sem impor isso aqui o atendente digita, aperta enviar, ve
 * "enviado" e so descobre horas depois — pelo relatorio — que a Meta recusou.
 *
 * Entao a janela vira dado de primeira classe: acompanha cada conversa na
 * listagem, o backend recusa o texto livre com 409 e a tela troca sozinha para
 * o seletor de templates.
 */

export const WINDOW_HOURS = 24;

/**
 * Canais em que a regra da Meta vale.
 *
 * `whatsapp` e a Cloud API falada direto daqui; `messageria` e o mesmo numero
 * falado pela Messageria. A regra e da Meta, nao do caminho — o que muda e
 * quem calcula a janela, e por isso o carimbo espelhado da Messageria e
 * gravado em `last_customer_message_at`: a conta abaixo continua sendo uma so.
 * Canais por QR Code nao passam pela Cloud API e nao tem essa regra.
 */
const PROVEDORES_COM_JANELA = ["whatsapp", "messageria"] as const;
const OFFICIAL_PROVIDER = "whatsapp";
const LISTA_SQL = PROVEDORES_COM_JANELA.map((p) => `'${p}'`).join(", ");

export type SendWindow = {
  /** `null` quando o canal nao segue a regra (QR Code) ou o cliente nunca escreveu. */
  expiresAt: string | null;
  open: boolean;
  /** Segundos restantes; 0 quando fechada. */
  secondsRemaining: number;
  applies: boolean;
};

export function windowFrom(lastCustomerMessageAt: string | Date | null, provider: string | null): SendWindow {
  const applies = PROVEDORES_COM_JANELA.includes((provider ?? "") as (typeof PROVEDORES_COM_JANELA)[number]);
  if (!applies || !lastCustomerMessageAt) {
    return { expiresAt: null, open: !applies, secondsRemaining: 0, applies };
  }
  const base = new Date(lastCustomerMessageAt).getTime();
  const expires = base + WINDOW_HOURS * 60 * 60 * 1000;
  const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
  return { expiresAt: new Date(expires).toISOString(), open: remaining > 0, secondsRemaining: remaining, applies };
}

/**
 * Cola em `select` para a listagem de conversas devolver a janela pronta.
 *
 * Calcular no SQL evita mandar `last_customer_message_at` junto de uma regra
 * duplicada no frontend: a janela e uma so, e ela nasce aqui.
 */
export const WINDOW_SELECT_SQL = `
  case when ch.provider in (${LISTA_SQL}) and c.last_customer_message_at is not null
       then c.last_customer_message_at + interval '${WINDOW_HOURS} hours'
       else null
  end as window_expires_at,
  case when ch.provider not in (${LISTA_SQL}) then true
       when c.last_customer_message_at is null then false
       else c.last_customer_message_at + interval '${WINDOW_HOURS} hours' > now()
  end as window_open`;

export async function assertSendWindow(tenantId: string, conversationId: string) {
  const result = await query<{ last_customer_message_at: string | null; provider: string | null }>(
    `select c.last_customer_message_at, ch.provider
     from conversations c
     left join channels ch on ch.id = c.channel_id
     where c.tenant_id = $1 and c.id = $2`,
    [tenantId, conversationId],
  );
  const row = result.rows[0];
  if (!row) return { allowed: false, reason: "Conversa nao encontrada.", expiresAt: null };

  const window = windowFrom(row.last_customer_message_at, row.provider);
  if (!window.applies || window.open) return { allowed: true, expiresAt: window.expiresAt };

  return {
    allowed: false,
    reason: row.last_customer_message_at
      ? "A janela de 24 horas fechou. Use um template aprovado para reabrir a conversa."
      : "O cliente ainda nao escreveu nesta conversa. Inicie por um template aprovado.",
    expiresAt: window.expiresAt,
  };
}

/** Conta `{{1}}`, `{{2}}`... no corpo — e o que a tela precisa pedir ao atendente. */
export function variablesIn(text: string | null | undefined) {
  if (!text) return 0;
  const found = new Set<number>();
  for (const match of text.matchAll(/\{\{\s*(\d+)\s*\}\}/g)) found.add(Number(match[1]));
  return found.size === 0 ? 0 : Math.max(...found);
}

export function renderTemplate(text: string | null | undefined, values: string[]) {
  if (!text) return "";
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index: string) => values[Number(index) - 1] ?? `{{${index}}}`);
}

type GraphTemplateComponent = { type?: string; text?: string; format?: string };
type GraphTemplate = {
  id?: string;
  name?: string;
  language?: string;
  category?: string;
  status?: string;
  components?: GraphTemplateComponent[];
};

function bodyTextOf(components: GraphTemplateComponent[] | undefined) {
  return components?.find((component) => component.type?.toUpperCase() === "BODY")?.text ?? null;
}

type AuthUser = { id: string; tenant_id: string; name: string; role: string };
type RequireAuth = (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
type RecordEvent = (
  tenantId: string,
  entityType: string,
  eventType: string,
  payload: unknown,
  actorUserId?: string | null,
  entityId?: string | null,
  requestId?: string | null,
) => Promise<void>;

export type TemplateRouteDeps = {
  requireAuth: RequireAuth;
  recordEvent: RecordEvent;
  getMetaIntegration: (tenantId: string) => Promise<{ tenantId: string; integration: { access_token: string | null } | null }>;
  graphVersion: string;
  touchConversationAfterSend: (tenantId: string, conversationId: string, status: string) => Promise<void>;
  decryptSecret: (value: string | null) => string | null;
};

const sendTemplateSchema = z.object({
  templateId: z.string().uuid(),
  variables: z.array(z.string().max(1024)).max(20).optional().default([]),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

export function registerWhatsAppTemplateRoutes(app: FastifyInstance, deps: TemplateRouteDeps) {
  app.get("/api/whatsapp/templates", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const filters = z
      .object({ onlyApproved: z.coerce.boolean().optional().default(true), channelId: z.string().uuid().optional() })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id];
    const where = ["t.tenant_id = $1"];
    if (filters.onlyApproved) where.push("upper(t.status) = 'APPROVED'");
    if (filters.channelId) {
      params.push(filters.channelId);
      where.push(`t.channel_id = $${params.length}`);
    }

    const result = await query(
      `select t.id, t.channel_id, t.waba_id, t.external_id, t.name, t.language, t.category, t.status,
              t.components, t.body_text, t.variable_count, t.synced_at
       from whatsapp_templates t
       where ${where.join(" and ")}
       order by t.name asc, t.language asc`,
      params,
    );
    return { templates: result.rows };
  });

  /**
   * Traz a lista da WABA para o banco.
   *
   * Consultar a Graph a cada abertura do inbox gastaria o rate limit da conta
   * num dado que muda quando alguem cria um template — raramente.
   */
  app.post("/api/whatsapp/templates/sync", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;

    // Com a Messageria conectada ela e a fonte: puxar da Graph aqui seria o CRM
    // mantendo infraestrutura Meta propria de novo, que e o que a decisao de
    // arquitetura tirou. O `whatsapp_templates` vira copia local, para o envio
    // continuar referenciando um id deste lado.
    const messageria = await conexaoMessageria(user.tenant_id, deps.decryptSecret);
    if (messageria?.api_key) {
      let vindos;
      try {
        vindos = (await listarModelos(messageria, messageria.canal_id)).modelos;
      } catch (erro) {
        if (erro instanceof MessageriaRequestError) return reply.code(502).send({ error: erro.message, codigo: erro.codigo });
        throw erro;
      }

      let criados = 0;
      let atualizados = 0;
      for (const modelo of vindos) {
        const resultado = await query<{ inserted: boolean }>(
          `insert into whatsapp_templates (tenant_id, waba_id, external_id, name, language, category, status, components, body_text, variable_count, synced_at)
           values ($1, null, $2, $3, $4, $5, $6, '[]'::jsonb, $7, $8, now())
           on conflict (tenant_id, name, language)
           do update set external_id = excluded.external_id, category = excluded.category, status = excluded.status,
                         body_text = excluded.body_text, variable_count = excluded.variable_count, synced_at = now()
           returning (xmax = 0) as inserted`,
          [user.tenant_id, modelo.id, modelo.nome, modelo.idioma, modelo.categoria, modelo.status, modelo.corpo, modelo.variaveis ?? variablesIn(modelo.corpo)],
        );
        if (resultado.rows[0]?.inserted) criados += 1;
        else atualizados += 1;
      }

      await deps.recordEvent(user.tenant_id, "integration", "messageria.templates_synced", { created: criados, updated: atualizados }, user.id, null, requestId);
      return { created: criados, updated: atualizados, total: criados + atualizados, errors: [], origem: "messageria" };
    }

    const { integration } = await deps.getMetaIntegration(user.tenant_id);
    if (!integration?.access_token) return reply.code(400).send({ error: "Meta ainda nao conectada." });

    const channels = await query<{ id: string; metadata: Record<string, unknown> }>(
      "select id, metadata from channels where tenant_id = $1 and provider = $2",
      [user.tenant_id, OFFICIAL_PROVIDER],
    );

    const wabaIds = new Map<string, string>();
    for (const channel of channels.rows) {
      const wabaId = channel.metadata?.waba_id;
      if (typeof wabaId === "string" && wabaId) wabaIds.set(wabaId, channel.id);
    }
    if (wabaIds.size === 0) {
      return reply.code(409).send({ error: "Nenhuma conta WhatsApp Business sincronizada. Rode a sincronizacao de canais antes." });
    }

    let created = 0;
    let updated = 0;
    const errors: string[] = [];

    for (const [wabaId, channelId] of wabaIds) {
      const url = new URL(`https://graph.facebook.com/${deps.graphVersion}/${wabaId}/message_templates`);
      url.searchParams.set("limit", "200");
      url.searchParams.set("fields", "id,name,language,category,status,components");

      const response = await fetch(url, { headers: { Authorization: `Bearer ${integration.access_token}` } });
      const data = (await response.json()) as { data?: GraphTemplate[]; error?: { message?: string } };
      if (!response.ok) {
        errors.push(data.error?.message ?? `Falha ao listar templates da WABA ${wabaId}.`);
        continue;
      }

      for (const template of data.data ?? []) {
        if (!template.name || !template.language) continue;
        const bodyText = bodyTextOf(template.components);
        const result = await query<{ inserted: boolean }>(
          `insert into whatsapp_templates (tenant_id, channel_id, waba_id, external_id, name, language, category, status, components, body_text, variable_count, synced_at)
           values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
           on conflict (tenant_id, name, language)
           do update set channel_id = excluded.channel_id, waba_id = excluded.waba_id, external_id = excluded.external_id,
                         category = excluded.category, status = excluded.status, components = excluded.components,
                         body_text = excluded.body_text, variable_count = excluded.variable_count, synced_at = now()
           returning (xmax = 0) as inserted`,
          [
            user.tenant_id,
            channelId,
            wabaId,
            template.id ?? null,
            template.name,
            template.language,
            template.category ?? null,
            template.status ?? "PENDING",
            JSON.stringify(template.components ?? []),
            bodyText,
            variablesIn(bodyText),
          ],
        );
        if (result.rows[0]?.inserted) created += 1;
        else updated += 1;
      }
    }

    await deps.recordEvent(user.tenant_id, "integration", "whatsapp.templates_synced", { created, updated, wabas: wabaIds.size, errors }, user.id, null, requestId);
    if (created + updated === 0 && errors.length > 0) return reply.code(502).send({ error: errors[0], errors });
    return { created, updated, total: created + updated, errors };
  });

  /** Envia um template — o unico caminho quando a janela de 24h fechou. */
  app.post("/api/conversations/:id/template", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    const requestId = (request as FastifyRequest & { requestId?: string }).requestId;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = sendTemplateSchema.parse(request.body);
    const idempotencyKey = body.idempotencyKey ?? randomUUID();

    const existing = await query(
      `select id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id, media_id
       from messages where tenant_id = $1 and idempotency_key = $2`,
      [user.tenant_id, idempotencyKey],
    );
    if (existing.rows[0]) return { message: existing.rows[0], idempotent: true };

    const template = await query<{ id: string; name: string; language: string; body_text: string | null; variable_count: number; status: string }>(
      "select id, name, language, body_text, variable_count, status from whatsapp_templates where tenant_id = $1 and id = $2",
      [user.tenant_id, body.templateId],
    );
    const chosen = template.rows[0];
    if (!chosen) return reply.code(404).send({ error: "Template nao encontrado." });
    if (chosen.status.toUpperCase() !== "APPROVED") return reply.code(409).send({ error: `Template com status ${chosen.status}: a Meta so entrega templates aprovados.` });
    if (body.variables.length < chosen.variable_count) {
      return reply.code(400).send({ error: `Este template precisa de ${chosen.variable_count} variavel(is).` });
    }

    const conversation = await query<{ id: string; contact_phone: string | null; channel_external_id: string | null; channel_provider: string | null }>(
      `select c.id, ct.phone as contact_phone, ch.external_id as channel_external_id, ch.provider as channel_provider
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       left join channels ch on ch.id = c.channel_id
       where c.tenant_id = $1 and c.id = $2`,
      [user.tenant_id, id],
    );
    const row = conversation.rows[0];
    if (!row) return reply.code(404).send({ error: "Conversa nao encontrada." });
    if (!row.channel_external_id || !row.contact_phone) return reply.code(400).send({ error: "Conversa sem canal ou telefone valido." });
    if (!PROVEDORES_COM_JANELA.includes((row.channel_provider ?? "") as (typeof PROVEDORES_COM_JANELA)[number])) {
      return reply.code(400).send({ error: "Templates existem apenas na API oficial do WhatsApp." });
    }

    const variables = body.variables.slice(0, chosen.variable_count);

    // Canal da Messageria: quem fala com a Meta e ela, que ja confere janela,
    // opt-out, modelo aprovado e franquia antes de deixar sair.
    if (row.channel_provider === "messageria") {
      const messageria = await conexaoMessageria(user.tenant_id, deps.decryptSecret);
      if (!messageria?.api_key) return reply.code(400).send({ error: "Messageria nao conectada." });

      let saida: { externalId: string | null; status: string | null };
      let erroMessageria: string | null = null;
      try {
        saida = await enviarPelaMessageria(messageria, {
          para: row.contact_phone,
          modelo: chosen.name,
          idioma: chosen.language,
          variaveis: variables,
          idempotencia: idempotencyKey,
        });
      } catch (erro) {
        if (!(erro instanceof MessageriaRequestError)) throw erro;
        saida = { externalId: null, status: "failed" };
        erroMessageria = erro.message;
      }

      const falhou = erroMessageria !== null;
      const gravada = await query(
        `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, body, message_type, metadata, status, idempotency_key, error_message, request_id, sent_at)
         values ($1, $2, $3, 'outbound', $4, $5, 'template', $6, $7, $8, $9, $10, now())
         returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id, media_id`,
        [
          user.tenant_id,
          id,
          saida.externalId,
          user.name,
          renderTemplate(chosen.body_text, variables),
          JSON.stringify({ messageria: { status: saida.status }, template: { name: chosen.name, language: chosen.language }, variables }),
          falhou ? "failed" : saida.status ?? "sent",
          idempotencyKey,
          erroMessageria,
          requestId ?? null,
        ],
      );

      await deps.touchConversationAfterSend(user.tenant_id, id, falhou ? "failed" : "sent");
      await deps.recordEvent(user.tenant_id, "message", falhou ? "messageria.template_failed" : "messageria.template_sent", { conversation_id: id, template: chosen.name }, user.id, gravada.rows[0].id, requestId);
      publishRealtimeAsync({ type: "message.created", tenantId: user.tenant_id, conversationId: id, data: gravada.rows[0] });

      if (falhou) return reply.code(502).send({ error: erroMessageria, message: gravada.rows[0], requestId });
      return { message: gravada.rows[0], requestId };
    }

    const { integration } = await deps.getMetaIntegration(user.tenant_id);
    if (!integration?.access_token) return reply.code(400).send({ error: "Meta ainda nao conectada." });

    const components = variables.length > 0
      ? [{ type: "body", parameters: variables.map((value) => ({ type: "text", text: value })) }]
      : [];

    const response = await fetch(`https://graph.facebook.com/${deps.graphVersion}/${row.channel_external_id}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: row.contact_phone,
        type: "template",
        template: { name: chosen.name, language: { code: chosen.language }, ...(components.length > 0 ? { components } : {}) },
      }),
    });
    const data = (await response.json()) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
    const failed = !response.ok || !data.messages?.[0]?.id;
    const errorMessage = failed ? data.error?.message ?? "Falha ao enviar o template pela Meta." : null;

    // O texto renderizado vai para `body`: quem ler a conversa depois precisa
    // ver o que o cliente recebeu, nao o nome interno do template.
    const saved = await query(
      `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, body, message_type, metadata, status, idempotency_key, error_message, request_id, sent_at)
       values ($1, $2, $3, 'outbound', $4, $5, 'template', $6, $7, $8, $9, $10, now())
       returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id, media_id`,
      [
        user.tenant_id,
        id,
        data.messages?.[0]?.id ?? null,
        user.name,
        renderTemplate(chosen.body_text, variables),
        JSON.stringify({ graph: data, template: { id: chosen.id, name: chosen.name, language: chosen.language }, variables }),
        failed ? "failed" : "sent",
        idempotencyKey,
        errorMessage,
        requestId ?? null,
      ],
    );

    await deps.touchConversationAfterSend(user.tenant_id, id, failed ? "failed" : "sent");
    await deps.recordEvent(
      user.tenant_id,
      "message",
      failed ? "message.template_failed" : "message.template_sent",
      { conversation_id: id, template: chosen.name, language: chosen.language },
      user.id,
      saved.rows[0].id,
      requestId,
    );

    publishRealtimeAsync({ type: "message.created", tenantId: user.tenant_id, conversationId: id, data: saved.rows[0] });

    if (failed) return reply.code(502).send({ error: errorMessage, message: saved.rows[0], requestId });
    return { message: saved.rows[0], requestId };
  });
}

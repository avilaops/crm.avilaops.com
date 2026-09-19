import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import {
  AiError,
  CAMPANHA_SCHEMA,
  CATALOGO_SCHEMA,
  TRIAGEM_SCHEMA,
  executar,
  loadAiConfig,
  promptCampanha,
  promptCatalogo,
  promptTriagem,
  readAiConfigView,
  saveAiConfig,
  testarConfig,
} from "./ai.js";
import { query } from "./db.js";
import { transcribeAudioFile, transcribeAudioBuffer } from "./whisper.js";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

type Dependencies = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  encryptSecret: (value: string | null) => string | null;
  decryptSecret: (value: string | null) => string | null;
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

function texto(valor: unknown, limite = 200) {
  return typeof valor === "string" ? valor.trim().slice(0, limite) : "";
}

function etiquetas(valor: unknown) {
  if (!Array.isArray(valor)) return [];
  return valor
    .map((item) => texto(item, 40).toLowerCase().replace(/\s+/g, "-"))
    .filter(Boolean)
    .slice(0, 4);
}

export function registerAiRoutes(app: FastifyInstance, deps: Dependencies) {
  const { requireAuth, encryptSecret, decryptSecret, recordEvent } = deps;

  async function exigirConfig(request: FastifyRequest, reply: FastifyReply) {
    const user = await requireAuth(request, reply);
    if (!user) return null;
    const config = await loadAiConfig(user.tenant_id, decryptSecret);
    if (!config) {
      reply.code(409).send({ error: "Configure o agente de IA antes de usar." });
      return null;
    }
    return { user, config };
  }

  // ── Configuração ─────────────────────────────────────────────────────────

  app.get("/api/ai/config", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const [config, uso] = await Promise.all([
      readAiConfigView(user.tenant_id),
      query<{ job: string; chamadas: string; entrada: string; saida: string }>(
        `select job, count(*)::text as chamadas,
                sum(input_tokens)::text as entrada, sum(output_tokens)::text as saida
           from ai_runs where tenant_id = $1 and created_at >= date_trunc('month', now())
          group by job order by count(*) desc`,
        [user.tenant_id],
      ),
    ]);
    return {
      config,
      usage: uso.rows.map((linha) => ({
        job: linha.job,
        calls: Number(linha.chamadas),
        inputTokens: Number(linha.entrada ?? 0),
        outputTokens: Number(linha.saida ?? 0),
      })),
    };
  });

  app.put("/api/ai/config", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const input = z
      .object({
        provider: z.enum(["openai", "deepseek", "groq"]).default("openai"),
        baseUrl: z.string().trim().max(200).optional(),
        model: z.string().trim().max(80).optional(),
        apiKey: z.string().trim().max(300).optional(),
      })
      .parse(request.body);

    await saveAiConfig(user.tenant_id, input, encryptSecret);
    await recordEvent(user.tenant_id, "integration", "ai.config_saved", { provider: input.provider }, user.id, null, null);

    const config = await loadAiConfig(user.tenant_id, decryptSecret);
    const check = config ? await testarConfig(config) : null;
    return { config: await readAiConfigView(user.tenant_id), check };
  });

  app.post("/api/ai/test", async (request, reply) => {
    const contexto = await exigirConfig(request, reply);
    if (!contexto) return;
    return { check: await testarConfig(contexto.config) };
  });

  app.get("/api/ai/runs", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const resultado = await query(
      `select id, job, model, status, input_tokens, output_tokens, duration_ms, error, created_at
         from ai_runs where tenant_id = $1 order by created_at desc limit 40`,
      [user.tenant_id],
    );
    return { runs: resultado.rows };
  });

  // ── Triagem da caixa de entrada ──────────────────────────────────────────

  /**
   * Lê os remetentes que ainda não viraram contato e propõe o cadastro: quem é,
   * de que empresa, com que etiquetas — e se vale cadastrar.
   */
  app.post("/api/ai/triagem", async (request, reply) => {
    const contexto = await exigirConfig(request, reply);
    if (!contexto) return;
    const { user, config } = contexto;
    const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(20).default(10) }).parse(request.body ?? {});

    const pendentes = await query<{ id: string; email: string; name: string | null; last_subject: string | null }>(
      `select s.id, s.email, s.name, s.last_subject
         from mail_senders s
        where s.tenant_id = $1 and s.status = 'new'
          and not exists (
            select 1 from ai_suggestions g
             where g.tenant_id = s.tenant_id and g.entity_type = 'mail_sender'
               and g.entity_id = s.id and g.job = 'triagem' and g.status = 'pending'
          )
        order by s.last_seen_at desc limit $2`,
      [user.tenant_id, limit],
    );

    let analisados = 0;
    for (const remetente of pendentes.rows) {
      try {
        const resposta = await executar(user.tenant_id, user.id, config, "triagem", promptTriagem([remetente]), TRIAGEM_SCHEMA);
        await query(
          `insert into ai_suggestions (tenant_id, entity_type, entity_id, job, payload)
           values ($1, 'mail_sender', $2, 'triagem', $3::jsonb)
           on conflict (tenant_id, entity_type, entity_id, job)
           do update set payload = excluded.payload, status = 'pending', created_at = now()`,
          [user.tenant_id, remetente.id, JSON.stringify({ ...resposta, email: remetente.email })],
        );
        analisados += 1;
      } catch (erro) {
        if (erro instanceof AiError) return reply.code(502).send({ error: erro.message, analisados });
        throw erro;
      }
    }

    return { analisados, restantes: pendentes.rowCount === limit ? "há mais na fila" : "fila coberta" };
  });

  // ── Catalogação da base ──────────────────────────────────────────────────

  /** Propõe nome limpo, empresa e setor para contatos que vieram sujos da agenda. */
  app.post("/api/ai/catalogar", async (request, reply) => {
    const contexto = await exigirConfig(request, reply);
    if (!contexto) return;
    const { user, config } = contexto;
    const { limit, onlyWithEmail } = z
      .object({
        limit: z.coerce.number().int().min(1).max(25).default(10),
        onlyWithEmail: z.boolean().default(false),
      })
      .parse(request.body ?? {});

    const alvos = await query<{ id: string; name: string; email: string | null; phone: string | null; company: string | null }>(
      `select c.id, c.name, c.email, c.phone, c.company
         from contacts c
        where c.tenant_id = $1
          and (c.company is null or c.company = '')
          ${onlyWithEmail ? "and c.email is not null and c.email <> ''" : ""}
          and not exists (
            select 1 from ai_suggestions g
             where g.tenant_id = c.tenant_id and g.entity_type = 'contact'
               and g.entity_id = c.id and g.job = 'catalogo' and g.status <> 'discarded'
          )
        order by c.updated_at desc limit $2`,
      [user.tenant_id, limit],
    );

    let analisados = 0;
    for (const contato of alvos.rows) {
      try {
        const resposta = await executar(user.tenant_id, user.id, config, "catalogo", promptCatalogo(contato), CATALOGO_SCHEMA);
        await query(
          `insert into ai_suggestions (tenant_id, entity_type, entity_id, job, payload)
           values ($1, 'contact', $2, 'catalogo', $3::jsonb)
           on conflict (tenant_id, entity_type, entity_id, job)
           do update set payload = excluded.payload, status = 'pending', created_at = now()`,
          [user.tenant_id, contato.id, JSON.stringify({ ...resposta, atual: contato.name })],
        );
        analisados += 1;
      } catch (erro) {
        if (erro instanceof AiError) return reply.code(502).send({ error: erro.message, analisados });
        throw erro;
      }
    }

    return { analisados };
  });

  // ── Sugestões: ver, aplicar, descartar ───────────────────────────────────

  app.get("/api/ai/suggestions", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filtros = z
      .object({
        job: z.enum(["triagem", "catalogo", "todos"]).default("todos"),
        status: z.enum(["pending", "applied", "discarded", "todos"]).default("pending"),
        limit: z.coerce.number().int().min(1).max(200).default(50),
      })
      .parse(request.query);

    const params: unknown[] = [user.tenant_id];
    const where = ["tenant_id = $1"];
    if (filtros.job !== "todos") {
      params.push(filtros.job);
      where.push(`job = $${params.length}`);
    }
    if (filtros.status !== "todos") {
      params.push(filtros.status);
      where.push(`status = $${params.length}`);
    }
    params.push(filtros.limit);

    const resultado = await query(
      `select id, entity_type, entity_id, job, payload, status, created_at
         from ai_suggestions where ${where.join(" and ")}
        order by created_at desc limit $${params.length}`,
      params,
    );
    return { suggestions: resultado.rows };
  });

  /**
   * Aplica a sugestão. É aqui que a proposta vira cadastro — e por isso passa
   * por uma pessoa: o modelo erra empresa com confiança de quem acertou.
   */
  app.post("/api/ai/suggestions/:id/apply", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const encontrada = await query<{ entity_type: string; entity_id: string; job: string; payload: Record<string, unknown> }>(
      "select entity_type, entity_id, job, payload from ai_suggestions where tenant_id = $1 and id = $2 and status = 'pending'",
      [user.tenant_id, id],
    );
    const sugestao = encontrada.rows[0];
    if (!sugestao) return reply.code(404).send({ error: "Sugestão não encontrada ou já tratada." });

    if (sugestao.job === "catalogo") {
      await query(
        `update contacts
            set name = coalesce(nullif($3, ''), name),
                company = coalesce(nullif($4, ''), company),
                tags = (select array(select distinct unnest(tags || $5::text[]))),
                updated_at = now()
          where tenant_id = $1 and id = $2`,
        [
          user.tenant_id,
          sugestao.entity_id,
          texto(sugestao.payload.nome, 160),
          texto(sugestao.payload.empresa, 160),
          etiquetas(sugestao.payload.etiquetas),
        ],
      );
    } else {
      const email = texto(sugestao.payload.email, 254).toLowerCase();
      const nome = texto(sugestao.payload.pessoa, 160) || texto(sugestao.payload.empresa, 160) || email;
      const existente = await query<{ id: string }>(
        "select id from contacts where tenant_id = $1 and lower(email) = $2 limit 1",
        [user.tenant_id, email],
      );

      const contatoId = existente.rows[0]?.id;
      if (contatoId) {
        await query(
          `update contacts set company = coalesce(nullif(company, ''), nullif($3, '')),
                  tags = (select array(select distinct unnest(tags || $4::text[]))), updated_at = now()
            where tenant_id = $1 and id = $2`,
          [user.tenant_id, contatoId, texto(sugestao.payload.empresa, 160), etiquetas(sugestao.payload.etiquetas)],
        );
      } else {
        const criado = await query<{ id: string }>(
          `insert into contacts (tenant_id, name, email, company, source, tags)
           values ($1, $2, $3, nullif($4, ''), 'triagem-ia', $5) returning id`,
          [user.tenant_id, nome, email, texto(sugestao.payload.empresa, 160), etiquetas(sugestao.payload.etiquetas)],
        );
        await query("update mail_senders set status = 'registered', contact_id = $3 where tenant_id = $1 and id = $2", [
          user.tenant_id,
          sugestao.entity_id,
          criado.rows[0].id,
        ]);
      }
    }

    await query("update ai_suggestions set status = 'applied', applied_at = now() where tenant_id = $1 and id = $2", [
      user.tenant_id,
      id,
    ]);
    await recordEvent(user.tenant_id, "contact", "ai.suggestion_applied", { job: sugestao.job }, user.id, sugestao.entity_id, null);
    return { ok: true };
  });

  app.post("/api/ai/suggestions/:id/discard", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    await query("update ai_suggestions set status = 'discarded' where tenant_id = $1 and id = $2", [user.tenant_id, id]);
    return { ok: true };
  });

  // ── Redação de campanha ──────────────────────────────────────────────────

  app.post("/api/ai/escrever-campanha", async (request, reply) => {
    const contexto = await exigirConfig(request, reply);
    if (!contexto) return;
    const { user, config } = contexto;
    const input = z
      .object({
        briefing: z.string().trim().min(10).max(2000),
        audience: z.string().trim().max(200).default("empresas consolidadas da região de Ribeirão Preto"),
      })
      .parse(request.body);

    try {
      const resposta = await executar(
        user.tenant_id,
        user.id,
        config,
        "campanha",
        promptCampanha(input.briefing, input.audience),
        CAMPANHA_SCHEMA,
      );
      return {
        subject: texto(resposta.assunto, 200),
        alternatives: Array.isArray(resposta.assuntos_alternativos)
          ? resposta.assuntos_alternativos.map((item) => texto(item, 200)).filter(Boolean)
          : [],
        previewText: texto(resposta.previa, 300),
        body: typeof resposta.corpo === "string" ? resposta.corpo.trim() : "",
      };
    } catch (erro) {
      if (erro instanceof AiError) return reply.code(502).send({ error: erro.message });
      throw erro;
    }
  });

  // ── Transcrição de Áudio (Faster-Whisper Local) ──────────────────────────

  app.post("/api/ai/transcribe", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const schema = z.object({
      filePath: z.string().optional(),
      base64Audio: z.string().optional(),
      extension: z.string().optional().default("wav"),
    });

    const parsed = schema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ error: "Informe filePath ou base64Audio." });
    }

    const { filePath, base64Audio, extension } = parsed.data;

    let result;
    if (filePath) {
      result = await transcribeAudioFile(filePath);
    } else if (base64Audio) {
      const buffer = Buffer.from(base64Audio, "base64");
      result = await transcribeAudioBuffer(buffer, extension);
    } else {
      return reply.code(400).send({ error: "Nenhum áudio fornecido." });
    }

    if (result.success) {
      await recordEvent(user.tenant_id, "ai", "whisper.transcribed", {
        language: result.language,
        duration: result.durationSeconds,
      }, user.id);
    }

    return reply.send(result);
  });
}


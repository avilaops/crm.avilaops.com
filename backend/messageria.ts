import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";
import { query } from "./db.js";

/**
 * Ponte com a Messageria (sms.avilaops.com).
 *
 * A decisão que isto implementa está no roadmap, seção 3: **a Messageria
 * entrega, o CRM opera**. Quem fala com a Meta é ela, que sabe o plano do
 * cliente, se a janela de 24h está aberta, se aquele número pediu para sair e
 * quanto a mensagem custou. O CRM cuida da jornada comercial — conversa ligada
 * a contato, lead e tarefa, atribuição, SLA.
 *
 * Por que não continuar falando com a Graph direto: dois sistemas inscritos no
 * mesmo WABA recebem cada evento duas vezes, e a Meta bloqueia o número, não a
 * mensagem. Ter dois caminhos para o mesmo número dobra o risco sem dobrar a
 * capacidade.
 *
 * O que fica de fora por ora: **mídia**. O `POST /api/v1/mensagens` da
 * Messageria aceita texto, modelo e produto do catálogo — imagem, documento e
 * áudio não existem lá. Enquanto não existirem, `whatsapp-media.ts` continua
 * falando com a Graph, e é a última coisa neste repositório que faz isso.
 */

export const MESSAGERIA_PROVIDER = "messageria";

/** Mesma tolerância da ponte com o ERP, e a mesma que a Messageria assina. */
const TOLERANCIA_ASSINATURA_S = 300;

const TIMEOUT_MS = 15_000;

/** Os tipos que este lado sabe tratar; é o que pedimos ao assinar. */
export const EVENTOS_ASSINADOS = [
  "whatsapp.recebida",
  "whatsapp.entregue",
  "whatsapp.falhou",
  "whatsapp.status",
  "whatsapp.descadastro",
];

export type MessageriaConnection = {
  tenant_id: string;
  base_url: string;
  api_key: string | null;
  webhook_secret: string | null;
  /** Canal padrão a usar quando a conversa não diz de qual número sair. */
  canal_id: string | null;
  webhook_id: string | null;
};

export class MessageriaRequestError extends Error {
  status: number;
  codigo: string | null;

  constructor(message: string, status = 502, codigo: string | null = null) {
    super(message);
    this.name = "MessageriaRequestError";
    this.status = status;
    this.codigo = codigo;
  }
}

export async function getConnection(
  tenantId: string,
  decrypt: (value: string | null) => string | null,
): Promise<MessageriaConnection | null> {
  const result = await query<{
    tenant_id: string;
    app_secret: string | null;
    access_token: string | null;
    metadata: Record<string, unknown>;
  }>(
    `select tenant_id, app_secret, access_token, metadata
     from integrations where tenant_id = $1 and provider = $2`,
    [tenantId, MESSAGERIA_PROVIDER],
  );

  const row = result.rows[0];
  if (!row) return null;

  return {
    tenant_id: row.tenant_id,
    base_url: String(row.metadata?.base_url ?? "https://sms.avilaops.com"),
    api_key: decrypt(row.access_token),
    webhook_secret: decrypt(row.app_secret),
    canal_id: (row.metadata?.canal_id as string) ?? null,
    webhook_id: (row.metadata?.webhook_id as string) ?? null,
  };
}

/**
 * Confere a assinatura de uma entrega da Messageria.
 *
 * É o mesmo envelope que o ERP manda (`t=<epoch>,v1=<hex>` sobre
 * `"<t>.<corpo>"`), de propósito: uma casa, um formato. A conferência está
 * escrita aqui, e não reaproveitada de `erp.ts`, porque mexer naquele caminho
 * sem conseguir exercitá-lo custaria mais do que estas vinte linhas — as duas
 * devem convergir quando houver como testar a do ERP.
 *
 * O carimbo de tempo é o que impede reapresentação: sem ele, uma entrega
 * capturada valeria para sempre e injetaria mensagem de cliente no inbox.
 */
export function verificarAssinatura(
  segredo: string,
  corpoCru: Buffer,
  cabecalho: string | undefined,
  agoraS = Math.floor(Date.now() / 1000),
): { valida: boolean; motivo?: string } {
  if (!cabecalho) return { valida: false, motivo: "Assinatura ausente." };

  const partes = new Map(
    cabecalho
      .split(",")
      .map((p) => p.trim().split("="))
      .filter((p): p is [string, string] => p.length === 2),
  );

  const t = Number(partes.get("t"));
  const recebida = partes.get("v1") ?? "";
  if (!Number.isFinite(t) || recebida.length === 0) return { valida: false, motivo: "Assinatura malformada." };
  if (Math.abs(agoraS - t) > TOLERANCIA_ASSINATURA_S) return { valida: false, motivo: "Assinatura fora da janela." };

  const esperada = createHmac("sha256", segredo).update(`${t}.${corpoCru.toString("utf8")}`).digest("hex");
  // `timingSafeEqual` lança quando os tamanhos diferem; conferir antes.
  if (esperada.length !== recebida.length) return { valida: false, motivo: "Assinatura invalida." };
  const iguais = timingSafeEqual(Buffer.from(esperada, "utf8"), Buffer.from(recebida, "utf8"));
  return iguais ? { valida: true } : { valida: false, motivo: "Assinatura invalida." };
}

async function chamar<T>(
  conexao: MessageriaConnection,
  caminho: string,
  init: RequestInit = {},
  idempotencia?: string,
): Promise<T> {
  if (!conexao.api_key) throw new MessageriaRequestError("Messageria sem chave configurada.", 400);

  let resposta: Response;
  try {
    resposta = await fetch(`${conexao.base_url}${caminho}`, {
      ...init,
      headers: {
        authorization: `Bearer ${conexao.api_key}`,
        "content-type": "application/json",
        ...(idempotencia ? { "idempotency-key": idempotencia } : {}),
        ...(init.headers ?? {}),
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (erro) {
    throw new MessageriaRequestError(`Messageria inacessivel: ${String(erro)}`, 502);
  }

  const dados = (await resposta.json().catch(() => ({}))) as Record<string, unknown>;
  if (!resposta.ok) {
    // A Messageria devolve `erro` e às vezes `codigo`; repassar os dois deixa a
    // tela dizer "fora da janela" em vez de "erro 400".
    throw new MessageriaRequestError(
      typeof dados.erro === "string" ? dados.erro : `Messageria respondeu ${resposta.status}.`,
      resposta.status,
      typeof dados.codigo === "string" ? dados.codigo : null,
    );
  }
  return dados as T;
}

export type CanalMessageria = { id: string; numero?: string | null; padrao?: boolean; teste?: boolean };
export type ModeloMessageria = {
  id: string;
  nome: string;
  idioma: string;
  categoria: string | null;
  status: string;
  corpo: string | null;
  variaveis: number;
  motivoRecusa: string | null;
};
export type JanelaMessageria = {
  telefone: string;
  canalId: string;
  aberta: boolean;
  expiraEm: string | null;
  segundosRestantes: number;
};

export function listarCanais(conexao: MessageriaConnection) {
  return chamar<{ canais: CanalMessageria[] }>(conexao, "/api/v1/whatsapp/canais");
}

export function listarModelos(conexao: MessageriaConnection, canalId?: string | null) {
  const busca = canalId ? `?canalId=${encodeURIComponent(canalId)}` : "";
  return chamar<{ canalId: string; modelos: ModeloMessageria[] }>(conexao, `/api/v1/whatsapp/modelos${busca}`);
}

/** A janela de 24h como a Messageria a conhece. O CRM espelha, não recalcula. */
export function consultarJanela(conexao: MessageriaConnection, telefone: string, canalId?: string | null) {
  const busca = canalId ? `?canalId=${encodeURIComponent(canalId)}` : "";
  return chamar<JanelaMessageria>(
    conexao,
    `/api/v1/whatsapp/conversas/${encodeURIComponent(telefone)}${busca}`,
  );
}

type RespostaEnvio = { mensagem?: { id?: string; status?: string }; id?: string; status?: string };

/**
 * O vocabulário de status da Messageria para o deste lado.
 *
 * Lá o enum é `FILA | ENVIADA | ENTREGUE | FALHOU | DESCADASTRADO`; aqui a tela
 * e os relatórios leem `sent | delivered | read | failed`. Guardar o texto cru
 * fazia a bolha da mensagem exibir "ENVIADA" e o filtro de falha não encontrar
 * nada — o inbox tem um vocabulário só, e a tradução é na fronteira.
 *
 * `DESCADASTRADO` vira `failed`: para quem atende, o efeito é o mesmo de não
 * ter sido entregue, e o motivo fica no `error_message`.
 */
export function traduzirStatus(status: string | null | undefined): string {
  switch ((status ?? "").toUpperCase()) {
    case "FILA":
      return "sent";
    case "ENVIADA":
      return "sent";
    case "ENTREGUE":
      return "delivered";
    case "LIDA":
      return "read";
    case "FALHOU":
    case "DESCADASTRADO":
      return "failed";
    default:
      // Status novo do outro lado não pode virar bolha em branco aqui.
      return status ? status.toLowerCase() : "sent";
  }
}

/**
 * Envia pela Messageria.
 *
 * `Idempotency-Key` sempre presente: o CRM reenvia por timeout, e sem a chave o
 * cliente receberia a mesma mensagem duas vezes — que é pior do que não
 * receber, porque não dá para desfazer.
 */
export async function enviar(
  conexao: MessageriaConnection,
  pedido: {
    para: string;
    texto?: string;
    modelo?: string;
    idioma?: string;
    variaveis?: string[];
    idempotencia?: string;
  },
): Promise<{ externalId: string | null; status: string | null }> {
  const idempotencia = pedido.idempotencia ?? randomUUID();
  const corpo: Record<string, unknown> = {
    canal: "whatsapp",
    para: pedido.para,
    ...(conexao.canal_id ? { canalId: conexao.canal_id } : {}),
    ...(pedido.texto ? { texto: pedido.texto } : {}),
    ...(pedido.modelo ? { modelo: pedido.modelo, idioma: pedido.idioma ?? "pt_BR" } : {}),
    ...(pedido.variaveis && pedido.variaveis.length > 0 ? { variaveis: pedido.variaveis } : {}),
  };

  const dados = await chamar<RespostaEnvio>(
    conexao,
    "/api/v1/mensagens",
    { method: "POST", body: JSON.stringify(corpo) },
    idempotencia,
  );

  return {
    externalId: dados.mensagem?.id ?? dados.id ?? null,
    status: traduzirStatus(dados.mensagem?.status ?? dados.status),
  };
}

/** Assina os eventos desta conta no endereço público do CRM. */
export async function assinarEventos(
  conexao: MessageriaConnection,
  urlDoWebhook: string,
): Promise<{ id: string; segredo: string }> {
  const dados = await chamar<{ webhook?: { id?: string }; segredo?: string }>(conexao, "/api/v1/webhooks", {
    method: "POST",
    body: JSON.stringify({ url: urlDoWebhook, nome: "crm.avilaops.com", eventos: EVENTOS_ASSINADOS }),
  });
  if (!dados.webhook?.id || !dados.segredo) {
    throw new MessageriaRequestError("A Messageria nao devolveu o segredo da assinatura.", 502);
  }
  return { id: dados.webhook.id, segredo: dados.segredo };
}

export async function desassinarEventos(conexao: MessageriaConnection, webhookId: string): Promise<void> {
  await chamar(conexao, `/api/v1/webhooks/${encodeURIComponent(webhookId)}`, { method: "DELETE" });
}

// ── Rotas ───────────────────────────────────────────────────────────────────

import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

export type MessageriaRouteDeps = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  canManage: (user: AuthUser) => boolean;
  recordEvent: (
    tenantId: string,
    entityType: string,
    eventType: string,
    payload: unknown,
    actorUserId?: string | null,
    entityId?: string | null,
    requestId?: string | null,
  ) => Promise<void>;
  encryptSecret: (value: string | null) => string | null;
  decryptSecret: (value: string | null) => string | null;
  /** Reaproveitados do webhook da Meta: casar contato e conversa é a mesma regra. */
  upsertContato: (tenantId: string, telefone: string, nome: string | undefined) => Promise<string>;
  obterConversa: (tenantId: string, channelId: string | null, contactId: string) => Promise<string>;
  publicar: (evento: {
    type: "conversation.updated" | "conversation.read" | "message.created" | "message.updated";
    tenantId: string;
    conversationId?: string | null;
    data?: Record<string, unknown> | null;
  }) => void;
};

const conectarSchema = z.object({
  baseUrl: z.string().url().optional(),
  apiKey: z.string().trim().min(10),
  canalId: z.string().trim().optional(),
});

function urlDoWebhook(tenantId: string) {
  const base = process.env.CRM_BASE_URL ?? "https://crm.avilaops.com";
  return `${base}/api/integrations/messageria/webhook/${tenantId}`;
}

/** O canal do CRM que espelha um número da Messageria. */
async function espelharCanal(tenantId: string, canalId: string, numero: string | null) {
  const resultado = await query<{ id: string }>(
    `insert into channels (tenant_id, provider, external_id, display_name, phone_number, status, metadata, updated_at)
     values ($1, 'messageria', $2, $3, $4, 'connected', $5, now())
     on conflict (tenant_id, provider, external_id)
     do update set display_name = excluded.display_name, phone_number = coalesce(excluded.phone_number, channels.phone_number),
                   status = 'connected', updated_at = now()
     returning id`,
    [tenantId, canalId, numero ? `WhatsApp ${numero}` : "WhatsApp (Messageria)", numero, JSON.stringify({ messageria_canal_id: canalId })],
  );
  return resultado.rows[0]?.id ?? null;
}

export function registerMessageriaRoutes(app: FastifyInstance, deps: MessageriaRouteDeps) {
  app.get("/api/integrations/messageria/status", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;

    const conexao = await getConnection(user.tenant_id, deps.decryptSecret);
    if (!conexao?.api_key) return { connected: false };

    // Uma listagem de canais é o menor pedido que prova que a chave ainda vale:
    // dizer "conectado" só porque há linha no banco foi o que fez a Central de
    // Integrações mentir por semanas.
    try {
      const { canais } = await listarCanais(conexao);
      return {
        connected: true,
        baseUrl: conexao.base_url,
        canalId: conexao.canal_id,
        assinaturaRegistrada: Boolean(conexao.webhook_id),
        canais,
      };
    } catch (erro) {
      const falha = erro instanceof MessageriaRequestError ? erro.message : String(erro);
      return { connected: true, baseUrl: conexao.base_url, canalId: conexao.canal_id, erro: falha };
    }
  });

  /**
   * Liga o CRM à Messageria e já assina os eventos.
   *
   * A assinatura acontece aqui, e não numa tela à parte, porque conectar sem
   * assinar deixa o envio funcionando e a entrada muda — que é exatamente o
   * estado em que ninguém percebe que está, até um cliente reclamar que
   * respondeu e ninguém viu.
   */
  app.post("/api/integrations/messageria/connect", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    if (!deps.canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });

    const corpo = conectarSchema.parse(request.body);
    const base = corpo.baseUrl ?? "https://sms.avilaops.com";
    const provisoria: MessageriaConnection = {
      tenant_id: user.tenant_id,
      base_url: base,
      api_key: corpo.apiKey,
      webhook_secret: null,
      canal_id: corpo.canalId ?? null,
      webhook_id: null,
    };

    let canais: CanalMessageria[];
    try {
      canais = (await listarCanais(provisoria)).canais;
    } catch (erro) {
      if (erro instanceof MessageriaRequestError) return reply.code(erro.status === 401 ? 400 : 502).send({ error: erro.message });
      throw erro;
    }

    // Sem canal escolhido, o padrão da conta; sem padrão, o primeiro. Quem
    // decide qual número atende é a Messageria, não este lado.
    const escolhido = corpo.canalId ?? canais.find((c) => c.padrao)?.id ?? canais[0]?.id ?? null;

    let assinatura: { id: string; segredo: string };
    try {
      assinatura = await assinarEventos({ ...provisoria, canal_id: escolhido }, urlDoWebhook(user.tenant_id));
    } catch (erro) {
      if (erro instanceof MessageriaRequestError) return reply.code(502).send({ error: `Conectado, mas a assinatura falhou: ${erro.message}` });
      throw erro;
    }

    await query(
      `insert into integrations (tenant_id, provider, access_token, app_secret, user_name, metadata, connected_at, updated_at)
       values ($1, $2, $3, $4, 'Messageria Avila Ops', $5, now(), now())
       on conflict (tenant_id, provider)
       do update set access_token = excluded.access_token, app_secret = excluded.app_secret,
                     metadata = excluded.metadata, connected_at = now(), updated_at = now()`,
      [
        user.tenant_id,
        MESSAGERIA_PROVIDER,
        deps.encryptSecret(corpo.apiKey),
        deps.encryptSecret(assinatura.segredo),
        JSON.stringify({ base_url: base, canal_id: escolhido, webhook_id: assinatura.id }),
      ],
    );

    for (const canal of canais) await espelharCanal(user.tenant_id, canal.id, canal.numero ?? null);

    // Sem segredo no evento: a trilha registra que houve conexão, não com o quê.
    await deps.recordEvent(user.tenant_id, "integration", "messageria.connected", { base_url: base, canal_id: escolhido }, user.id, null, (request as FastifyRequest & { requestId?: string }).requestId);
    return { ok: true, canalId: escolhido, canais };
  });

  app.post("/api/integrations/messageria/disconnect", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    if (!deps.canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });

    const conexao = await getConnection(user.tenant_id, deps.decryptSecret);
    // Tira a assinatura lá antes de esquecer a chave aqui: sem isso a Messageria
    // seguiria tentando entregar num endereço que não confere mais nada.
    if (conexao?.webhook_id) {
      try {
        await desassinarEventos(conexao, conexao.webhook_id);
      } catch (erro) {
        request.log.warn({ erro: String(erro) }, "Nao foi possivel remover a assinatura na Messageria");
      }
    }

    await query("delete from integrations where tenant_id = $1 and provider = $2", [user.tenant_id, MESSAGERIA_PROVIDER]);
    await deps.recordEvent(user.tenant_id, "integration", "messageria.disconnected", {}, user.id, null, (request as FastifyRequest & { requestId?: string }).requestId);
    return { ok: true };
  });

  /**
   * Recepção dos eventos da Messageria.
   *
   * Rota pública: quem chama é a Messageria, que não tem sessão aqui. A
   * autenticação é a assinatura, e o tenant vem do caminho porque a entrega não
   * carrega cabeçalho de tenant — o endereço é registrado por tenant no
   * `connect`, e a assinatura é que prova quem mandou.
   */
  app.post("/api/integrations/messageria/webhook/:tenantId", async (request, reply) => {
    const { tenantId } = z.object({ tenantId: z.string().uuid() }).parse(request.params);
    const conexao = await getConnection(tenantId, deps.decryptSecret);
    if (!conexao?.webhook_secret) return reply.code(404).send({ error: "Messageria nao conectada." });

    const corpoCru = (request as FastifyRequest & { rawBody?: Buffer }).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    const cabecalho = request.headers["x-avila-assinatura-v2"];
    const conferencia = verificarAssinatura(
      conexao.webhook_secret,
      corpoCru,
      Array.isArray(cabecalho) ? cabecalho[0] : cabecalho,
    );
    if (!conferencia.valida) {
      await deps.recordEvent(tenantId, "integration", "messageria.webhook_invalid_signature", { motivo: conferencia.motivo, ip: request.ip });
      return reply.code(401).send({ error: conferencia.motivo });
    }

    const evento = request.body as Record<string, unknown>;
    const tipo = typeof evento.tipo === "string" ? evento.tipo : "desconhecido";

    // A chave de idempotência por tipo: a mensagem recebida tem o id da Meta; o
    // status não tem id próprio, e o par mensagem+estado é o que não se repete.
    const chave =
      typeof evento.idExterno === "string"
        ? `recebida:${evento.idExterno}`
        : typeof evento.mensagemId === "string"
          ? `status:${evento.mensagemId}:${String(evento.status ?? tipo)}`
          : `${tipo}:${String(evento.em ?? "")}:${String(evento.de ?? evento.telefone ?? "")}`;

    let inboundId: string;
    try {
      const inserido = await query<{ id: string }>(
        `insert into inbound_events (tenant_id, source, external_id, event_type, payload)
         values ($1, 'messageria', $2, $3, $4) returning id`,
        [tenantId, chave, tipo, JSON.stringify(evento)],
      );
      inboundId = inserido.rows[0].id;
    } catch (erro) {
      // 200 de propósito: repetir é comportamento normal de quem entrega pelo
      // menos uma vez, e devolver erro faria a Messageria reentregar à toa.
      if ((erro as { code?: string }).code === "23505") return { ok: true, duplicado: true };
      throw erro;
    }

    try {
      const resultado = await tratarEvento(tenantId, conexao, evento, tipo, deps);
      await query("update inbound_events set processed_at = now() where id = $1", [inboundId]);
      return { ok: true, ...resultado };
    } catch (erro) {
      // Falha de regra não melhora com reentrega: grava o erro e responde 200,
      // para o evento não circular até a dead-letter da Messageria.
      const mensagem = String(erro).slice(0, 1000);
      await query("update inbound_events set error = $2 where id = $1", [inboundId, mensagem]);
      request.log.error({ err: erro }, "Falha ao processar evento da Messageria");
      return { ok: false, error: "Evento registrado com erro." };
    }
  });
}

/** O que cada tipo de evento faz no CRM. */
async function tratarEvento(
  tenantId: string,
  conexao: MessageriaConnection,
  evento: Record<string, unknown>,
  tipo: string,
  deps: MessageriaRouteDeps,
): Promise<Record<string, unknown>> {
  if (tipo === "whatsapp.recebida") {
    const telefone = String(evento.de ?? "").trim();
    if (!telefone) throw new Error("Evento sem telefone de origem.");

    const canalId = typeof evento.canalId === "string" ? evento.canalId : conexao.canal_id;
    const channelId = canalId ? await espelharCanal(tenantId, canalId, null) : null;
    const contactId = await deps.upsertContato(tenantId, telefone, undefined);
    const conversationId = await deps.obterConversa(tenantId, channelId, contactId);

    const texto = typeof evento.texto === "string" ? evento.texto : null;
    const idExterno = typeof evento.idExterno === "string" ? evento.idExterno : null;
    const enviadaEm = typeof evento.em === "string" ? evento.em : new Date().toISOString();

    const inserida = await query(
      `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, metadata, sent_at)
       values ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9)
       on conflict (tenant_id, external_id) do nothing
       returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, error_message, request_id, media_id, sent_at, created_at`,
      [
        tenantId,
        conversationId,
        idExterno,
        telefone,
        telefone,
        texto,
        typeof evento.tipoDaMensagem === "string" ? evento.tipoDaMensagem : "text",
        JSON.stringify(evento),
        enviadaEm,
      ],
    );
    const nova = inserida.rows[0] ?? null;

    // A janela vem pronta da Messageria. Guardar o carimbo que ela mandou, em
    // vez de somar 24h aqui, é o que impede as duas pontas divergirem.
    const janela = typeof evento.janelaExpiraEm === "string" ? evento.janelaExpiraEm : null;
    const conversa = await query<{ unread_count: number }>(
      `update conversations
       set status = 'waiting',
           last_message_at = greatest(coalesce(last_message_at, $2::timestamptz), $2::timestamptz),
           last_customer_message_at = coalesce($3::timestamptz - interval '24 hours', greatest(coalesce(last_customer_message_at, $2::timestamptz), $2::timestamptz)),
           unread_count = unread_count + $4,
           updated_at = now()
       where id = $1
       returning unread_count`,
      [conversationId, enviadaEm, janela, nova ? 1 : 0],
    );

    if (nova) {
      deps.publicar({ type: "message.created", tenantId, conversationId, data: nova });
      deps.publicar({
        type: "conversation.updated",
        tenantId,
        conversationId,
        data: { id: conversationId, status: "waiting", unread_count: conversa.rows[0]?.unread_count ?? 0, preview: texto },
      });
    }
    return { mensagem: nova ? 1 : 0, duplicada: !nova };
  }

  if (tipo === "whatsapp.entregue" || tipo === "whatsapp.falhou" || tipo === "whatsapp.status") {
    const mensagemId = typeof evento.mensagemId === "string" ? evento.mensagemId : null;
    if (!mensagemId) return { ignorado: "status sem mensagemId" };

    const status = evento.status ? traduzirStatus(String(evento.status)) : tipo === "whatsapp.entregue" ? "delivered" : "failed";
    const atualizada = await query<{ id: string; conversation_id: string }>(
      `update messages set status = $3, error_message = $4, metadata = metadata || $5::jsonb
       where tenant_id = $1 and external_id = $2
       returning id, conversation_id`,
      [tenantId, mensagemId, status, typeof evento.detalhe === "string" ? evento.detalhe : null, JSON.stringify({ messageria: evento })],
    );
    const alvo = atualizada.rows[0];
    if (alvo) deps.publicar({ type: "message.updated", tenantId, conversationId: alvo.conversation_id, data: { id: alvo.id, status } });
    return { status: alvo ? 1 : 0 };
  }

  if (tipo === "whatsapp.descadastro") {
    // Pedido de saída não é mensagem: vira marca no contato, e quem atende
    // precisa ver antes de escrever de novo.
    const telefone = String(evento.telefone ?? evento.de ?? "").trim();
    if (!telefone) return { ignorado: "descadastro sem telefone" };
    await query(
      `update contacts set source = coalesce(source, 'whatsapp'), updated_at = now()
       where tenant_id = $1 and phone = $2`,
      [tenantId, telefone],
    );
    return { descadastro: telefone };
  }

  return { ignorado: tipo };
}

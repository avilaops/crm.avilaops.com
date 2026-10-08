import pg from "pg";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { config } from "dotenv";
import { query } from "./db.js";

config({ path: ".env.local" });
config({ path: ".env" });

/**
 * Empurra para o inbox o que acabou de acontecer no banco.
 *
 * O transporte e SSE, nao WebSocket: o inbox so precisa do sentido
 * servidor -> navegador (responder, atribuir e arquivar continuam sendo REST),
 * e SSE e HTTP comum — atravessa o nginx que ja esta no ar, reconecta sozinho
 * pelo EventSource e nao adiciona dependencia nenhuma.
 *
 * A distribuicao passa por `pg_notify` em vez de um Set em memoria porque o
 * atendente conectado na instancia A precisa ver a mensagem que chegou pelo
 * webhook na instancia B. Com um unico container o caminho e o mesmo, so que
 * subir a segunda replica deixa de ser uma reescrita.
 */

const CHANNEL = "agenda_realtime";

/** `pg_notify` corta o payload em 8000 bytes; a margem cobre o escape do JSON. */
const MAX_NOTIFY_BYTES = 6000;

const HEARTBEAT_MS = 25_000;
const RECONNECT_MIN_MS = 1_000;
const RECONNECT_MAX_MS = 30_000;

export type RealtimeEventType =
  | "conversation.updated"
  | "conversation.read"
  | "message.created"
  | "message.updated";

export type RealtimeEvent = {
  type: RealtimeEventType;
  tenantId: string;
  conversationId?: string | null;
  /**
   * Corpo completo quando cabe no NOTIFY. Quando nao cabe o evento chega com
   * `truncated: true` e a tela busca o dado pela rota REST — a mensagem nunca
   * aparece cortada para quem esta atendendo.
   */
  data?: Record<string, unknown> | null;
  truncated?: boolean;
};

type Subscriber = {
  tenantId: string;
  deliver: (event: RealtimeEvent) => void;
};

type Logger = (message: string, detail?: unknown) => void;

const subscribers = new Set<Subscriber>();

let listener: pg.Client | null = null;
let listenerReady = false;
let stopped = false;
let reconnectDelay = RECONNECT_MIN_MS;
let log: Logger = () => {};

function deliverLocal(event: RealtimeEvent) {
  for (const subscriber of subscribers) {
    if (subscriber.tenantId !== event.tenantId) continue;
    try {
      subscriber.deliver(event);
    } catch (error) {
      // Um socket morto nao pode impedir a entrega para os outros atendentes.
      log("[realtime] falha ao entregar evento para um assinante", error);
    }
  }
}

function encode(event: RealtimeEvent) {
  const full = JSON.stringify(event);
  if (Buffer.byteLength(full, "utf8") <= MAX_NOTIFY_BYTES) return full;
  const compact: RealtimeEvent = {
    type: event.type,
    tenantId: event.tenantId,
    conversationId: event.conversationId ?? null,
    truncated: true,
  };
  return JSON.stringify(compact);
}

function scheduleReconnect() {
  if (stopped) return;
  const delay = reconnectDelay;
  reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
  setTimeout(() => {
    void connectListener();
  }, delay).unref?.();
}

async function connectListener() {
  if (stopped || listener) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  listener = client;

  client.on("notification", (message) => {
    if (message.channel !== CHANNEL || !message.payload) return;
    try {
      deliverLocal(JSON.parse(message.payload) as RealtimeEvent);
    } catch (error) {
      log("[realtime] payload invalido recebido do Postgres", error);
    }
  });

  client.on("error", (error) => {
    log("[realtime] conexao de escuta caiu", error);
    listenerReady = false;
    listener = null;
    client.end().catch(() => {});
    scheduleReconnect();
  });

  try {
    await client.connect();
    await client.query(`listen ${CHANNEL}`);
    listenerReady = true;
    reconnectDelay = RECONNECT_MIN_MS;
    log("[realtime] escutando eventos do Postgres");
  } catch (error) {
    log("[realtime] nao foi possivel escutar o Postgres, seguindo em memoria", error);
    listenerReady = false;
    listener = null;
    client.end().catch(() => {});
    scheduleReconnect();
  }
}

export async function startRealtime(options: { log?: Logger } = {}) {
  stopped = false;
  if (options.log) log = options.log;
  await connectListener();
}

export async function stopRealtime() {
  stopped = true;
  listenerReady = false;
  const client = listener;
  listener = null;
  if (client) await client.end().catch(() => {});
}

/**
 * Publica um evento para todas as instancias.
 *
 * Nunca lanca: tempo real e melhoria de experiencia, e derrubar a ingestao do
 * webhook da Meta por causa de um NOTIFY que falhou custaria a mensagem do
 * cliente — o dado ja esta salvo quando esta funcao roda.
 */
export async function publishRealtime(event: RealtimeEvent) {
  if (!listenerReady) {
    deliverLocal(event);
    return;
  }
  try {
    await query("select pg_notify($1, $2)", [CHANNEL, encode(event)]);
  } catch (error) {
    log("[realtime] NOTIFY falhou, entregando apenas nesta instancia", error);
    deliverLocal(event);
  }
}

/** Versao sem `await` para os caminhos que nao podem esperar o banco. */
export function publishRealtimeAsync(event: RealtimeEvent) {
  void publishRealtime(event).catch((error) => log("[realtime] falha ao publicar evento", error));
}

export function realtimeStatus() {
  return { listening: listenerReady, subscribers: subscribers.size };
}

type RequireAuth = (
  request: FastifyRequest,
  reply: FastifyReply,
) => Promise<{ id: string; tenant_id: string } | null>;

export function registerRealtimeRoutes(app: FastifyInstance, deps: { requireAuth: RequireAuth }) {
  app.get("/api/realtime/presence", async (request, reply) => {
    const user = await deps.requireAuth(request,reply); if(!user) return;
    const users=await query("select u.id,u.name,max(s.last_seen_at) as last_seen_at from users u join sessions s on s.user_id=u.id and s.tenant_id=u.tenant_id where u.tenant_id=$1 and u.active=true and s.expires_at>now() and s.last_seen_at>now()-interval '60 seconds' group by u.id,u.name order by u.name",[user.tenant_id]);
    return {users:users.rows};
  });
  app.get("/api/realtime", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;

    // `hijack` tira o Fastify do caminho: a resposta fica aberta por horas e
    // os hooks de onSend assumem um payload que termina.
    reply.hijack();
    const stream = reply.raw;

    stream.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-store, no-transform",
      Connection: "keep-alive",
      // Sem isso o nginx segura o fluxo no buffer e o inbox so atualiza quando
      // o buffer enche — o header resolve no proxy sem depender do nginx.conf.
      "X-Accel-Buffering": "no",
    });

    const write = (payload: string) => {
      if (stream.writableEnded) return;
      stream.write(payload);
    };

    write("retry: 3000\n\n");
    write(`event: ready\ndata: ${JSON.stringify({ tenantId: user.tenant_id })}\n\n`);

    const subscriber: Subscriber = {
      tenantId: user.tenant_id,
      deliver: (event) => write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`),
    };
    subscribers.add(subscriber);

    const heartbeat = setInterval(() => {
      void deps.requireAuth(request, reply).then(current => {
        if (!current || current.id !== user.id || current.tenant_id !== user.tenant_id) { close(); stream.end(); return; }
        write(": ping\n\n");
      }).catch(() => { close(); stream.end(); });
    }, HEARTBEAT_MS);
    heartbeat.unref?.();

    const close = () => {
      clearInterval(heartbeat);
      subscribers.delete(subscriber);
    };

    request.raw.on("close", close);
    request.raw.on("error", close);
  });
}

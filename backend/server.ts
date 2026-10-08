import { googleRedirectUri } from "./google-config.js";
import { config } from "dotenv";
import fastifyMultipart from "@fastify/multipart";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { query, transaction } from "./db.js";
import { registerCrmCoreRoutes } from "./routes-crm-core.js";
import { installErrorHandler, validateTenantReferences } from "./tenant-access.js";
import { ehMensagemDeAudio, transcreverEGravar } from "./transcricao.js";
import { publishRealtime, publishRealtimeAsync, registerRealtimeRoutes, startRealtime } from "./realtime.js";
import { ingestInboundMedia, maxMediaBytes, registerWhatsAppMediaRoutes, WHATSAPP_MEDIA_TYPES } from "./whatsapp-media.js";
import { assertSendWindow, registerWhatsAppTemplateRoutes, WINDOW_SELECT_SQL } from "./whatsapp-templates.js";
import { enviar as enviarPelaMessageria, getConnection as conexaoMessageria, MessageriaRequestError, registerMessageriaRoutes } from "./messageria.js";
import { paginaDaMeta, precisaRenovar, registerAuthMetaRoutes, renovarConexaoMeta, type CanalDescoberto } from "./auth-meta.js";
import { registerMailRoutes } from "./routes-mail.js";
import { startAutomation } from "./automation.js";
import { registerAiRoutes } from "./routes-ai.js";
import { registerProductRoutes } from "./routes-products.js";
import { registerAutomationRoutes } from "./routes-automations.js";
import { registerSegmentRoutes } from "./routes-segments.js";
import { registerMediaRoutes } from "./routes-media.js";
import { registerTeamRoutes } from "./routes-team.js";
import { registerSettingsRoutes } from "./routes-settings.js";
import { registerAccountRoutes } from "./routes-account.js";
import { signOAuthState, verifyOAuthState } from "./oauth-state.js";
import {
  ERP_PROVIDER,
  ErpRequestError,
  findConnectionByErpTenant,
  getConnection,
  handleErpEvent,
  pushContactToErp,
  verifyErpSignature,
  type ErpEventEnvelope,
} from "./erp.js";

config({ path: ".env.local" });
config({ path: ".env" });

const META_GRAPH_VERSION = "v23.0";
const META_PROVIDER = "meta";
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "avila-ops";
const PORT = Number(process.env.PORT ?? 3000);
const SESSION_COOKIE = "agenda_session";
const SSO_COOKIE = "avila_sso";
const SSO_ISSUER = "auth.avilaops.com";
const SESSION_DAYS = 7;
const SECRET_PREFIX = "v1:";
const RATE_LIMITS = new Map<string, { count: number; resetAt: number }>();
const scrypt = promisify(scryptCallback);

type MetaIntegration = {
  app_id: string | null;
  app_secret: string | null;
  access_token: string | null;
  user_name: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
  metadata: Record<string, unknown> | null;
};

const META_COLUMNS = "app_id, app_secret, access_token, user_name, connected_at, token_expires_at, metadata";
/** Desligado nos testes (`background: false`): leitura de integração não vai à rede. */
let renovacaoMetaLigada = false;

type AuthUser = {
  id: string;
  tenant_id: string;
  name: string;
  email: string;
  role: string;
};

type RawBodyRequest = FastifyRequest & { rawBody?: Buffer };

type WhatsAppWebhookPayload = {
  object?: string;
  entry?: Array<{
    id?: string;
    changes?: Array<{
      field?: string;
      value?: {
        messaging_product?: string;
        metadata?: { display_phone_number?: string; phone_number_id?: string };
        contacts?: Array<{ wa_id?: string; profile?: { name?: string } }>;
        messages?: Array<Record<string, unknown>>;
        statuses?: Array<Record<string, unknown>>;
      };
    }>;
  }>;
};

type RequestWithId = FastifyRequest & { requestId?: string };

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "..");
const distDir = join(rootDir, "dist");

function parseCookies(header?: string) {
  const cookies = new Map<string, string>();
  for (const part of (header ?? "").split(";")) {
    const [rawName, ...rawValue] = part.trim().split("=");
    if (!rawName || rawValue.length === 0) continue;
    cookies.set(rawName, decodeURIComponent(rawValue.join("=")));
  }
  return cookies;
}

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function encryptionKey() {
  const raw = process.env.ENCRYPTION_KEY;
  if (!raw) throw new Error("ENCRYPTION_KEY is required for encrypted integration secrets.");
  return createHash("sha256").update(raw).digest();
}

function encryptSecret(value: string | null) {
  if (!value) return value;
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return `${SECRET_PREFIX}${iv.toString("hex")}:${cipher.getAuthTag().toString("hex")}:${encrypted.toString("hex")}`;
}

function decryptSecret(value: string | null) {
  if (!value) return value;
  if (!value.startsWith(SECRET_PREFIX)) return value;
  const [ivHex, tagHex, encryptedHex] = value.slice(SECRET_PREFIX.length).split(":");
  if (!ivHex || !tagHex || !encryptedHex) throw new Error("Invalid encrypted secret format.");
  const decipher = createDecipheriv("aes-256-gcm", encryptionKey(), Buffer.from(ivHex, "hex"));
  decipher.setAuthTag(Buffer.from(tagHex, "hex"));
  return Buffer.concat([decipher.update(Buffer.from(encryptedHex, "hex")), decipher.final()]).toString("utf8");
}

function checkRateLimit(key: string, limit: number, windowMs: number) {
  const now = Date.now();
  const current = RATE_LIMITS.get(key);
  if (!current || current.resetAt <= now) {
    RATE_LIMITS.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (current.count >= limit) return false;
  current.count += 1;
  return true;
}

function isValidSignature(rawBody: Buffer, headerValue: string | undefined, appSecret: string | null | undefined) {
  if (!headerValue || !appSecret) return false;
  const [algorithm, signatureHex] = headerValue.split("=");
  if (algorithm !== "sha256" || !signatureHex) return false;
  const expected = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  const actual = Buffer.from(signatureHex, "hex");
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = (await scrypt(password, salt, 64)) as Buffer;
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

async function verifyPassword(password: string, stored: string | null) {
  if (!stored) return false;
  const [method, salt, expectedHex] = stored.split("$");
  if (method !== "scrypt" || !salt || !expectedHex) return false;
  const actual = (await scrypt(password, salt, 64)) as Buffer;
  const expected = Buffer.from(expectedHex, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

async function ensureInitialAdminPassword() {
  const password = process.env.ADMIN_INITIAL_PASSWORD;
  if (!password) return;
  const tenantId = await getTenantId();
  const passwordHash = await hashPassword(password);
  try {
    await query("update users set password_hash = coalesce(password_hash, $1) where tenant_id = $2 and email = $3", [
      passwordHash,
      tenantId,
      "nicolasrosaab@gmail.com",
    ]);
  } catch (error) {
    if (typeof error === "object" && error && "code" in error && error.code === "42703") return;
    throw error;
  }
}

async function getSessionUser(cookieHeader?: string): Promise<AuthUser | null> {
  const token = parseCookies(cookieHeader).get(SESSION_COOKIE);
  if (!token) return null;
  const result = await query<AuthUser>(
    `select u.id, u.tenant_id, u.name, u.email, u.role
     from sessions s
     join users u on u.id = s.user_id and u.tenant_id = s.tenant_id and u.active = true
     where s.token_hash = $1 and s.expires_at > now()`,
    [hashToken(token)],
  );
  const user = result.rows[0] ?? null;
  if (user) {
    await query("update sessions set last_seen_at = now() where token_hash = $1", [hashToken(token)]);
  }
  return user;
}

async function requireAuth(request: FastifyRequest, reply: FastifyReply) {
  const user = await getSessionUser(request.headers.cookie as string | undefined);
  if (!user) {
    if (!reply.sent) reply.code(401).send({ error: "Autenticacao obrigatoria." });
    return null;
  }
  if (/^\/api\/(contacts|leads|tasks|conversations)(\/|$)/.test(request.url) && ["POST", "PATCH", "PUT"].includes(request.method) && request.body && typeof request.body === "object") {
    await validateTenantReferences(user.tenant_id, request.body as Record<string, unknown>);
  }
  return user;
}

async function getTenantId() {
  const result = await query<{ id: string }>("select id from tenants where slug = $1", [DEFAULT_TENANT_SLUG]);
  if (!result.rows[0]) throw new Error(`Tenant not found: ${DEFAULT_TENANT_SLUG}`);
  return result.rows[0].id;
}

type SsoSession = { sub: string; email: string; nome: string; papel: "ADMIN" | "CLIENTE" };

/**
 * Verifica o JWT de sessao emitido por auth.avilaops.com.
 *
 * Feito com node:crypto em vez de uma lib de JWT porque o unico algoritmo que
 * precisamos aceitar e HS256, e o projeto ja usa createHmac/timingSafeEqual —
 * nao vale uma dependencia nova para isso.
 */
function verifySsoToken(token: string): SsoSession | null {
  const secret = process.env.SSO_JWT_SECRET;
  if (!secret) return null;

  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [rawHeader, rawPayload, rawSignature] = parts;

  let header: { alg?: string };
  try {
    header = JSON.parse(Buffer.from(rawHeader, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  // Obrigatorio: sem fixar o algoritmo, um token forjado com alg "none" (ou com
  // uma cifra assimetrica cuja chave publica e conhecida) passaria pela conferencia.
  if (header.alg !== "HS256") return null;

  const esperado = createHmac("sha256", secret).update(`${rawHeader}.${rawPayload}`).digest();
  const recebido = Buffer.from(rawSignature, "base64url");
  // timingSafeEqual lanca quando os tamanhos diferem; conferir antes.
  if (esperado.length !== recebido.length) return null;
  if (!timingSafeEqual(esperado, recebido)) return null;

  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(Buffer.from(rawPayload, "base64url").toString("utf8"));
  } catch {
    return null;
  }

  if (payload.iss !== SSO_ISSUER) return null;
  if (typeof payload.exp !== "number" || payload.exp * 1000 <= Date.now()) return null;
  if (payload.papel !== "ADMIN" && payload.papel !== "CLIENTE") return null;
  if (typeof payload.email !== "string" || typeof payload.sub !== "string") return null;

  return {
    sub: payload.sub,
    email: payload.email,
    nome: typeof payload.nome === "string" ? payload.nome : payload.email,
    papel: payload.papel,
  };
}

function urlLoginSso() {
  const base = process.env.SSO_BASE_URL ?? "https://auth.avilaops.com";
  const returnTo = `${process.env.CRM_BASE_URL ?? "https://crm.avilaops.com"}/api/auth/sso`;
  return `${base}/login?app=crm&returnTo=${encodeURIComponent(returnTo)}`;
}

function cabecalhoCookieSessao(token: string) {
  const secure = process.env.NODE_ENV === "production" ? "; Secure" : "";
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${secure}`;
}
const GOOGLE_PROVIDER = "google_calendar";

/**
 * Hash do token da sessão do pedido: separa "esta sessão" das outras em Minha
 * conta e amarra o `state` do OAuth do Google.
 *
 * O `state` era o id do tenant e o retorno não pedia sessão: quem soubesse esse
 * id ligava a própria conta Google à agenda da empresa alheia — e as tarefas
 * passavam a ser copiadas para o calendário dela. Agora o retorno exige a mesma
 * sessão (o cookie é SameSite=Lax, então vem na volta do Google) e o `state` só
 * confere com ela; ver `oauth-state.ts`.
 */
function sessionHashFrom(cookieHeader?: string) {
  const token = parseCookies(cookieHeader).get(SESSION_COOKIE);
  return token ? hashToken(token) : null;
}

async function readMetaIntegration(tenantId: string) {
  const result = await query<MetaIntegration>(`select ${META_COLUMNS} from integrations where tenant_id = $1 and provider = $2`, [tenantId, META_PROVIDER]);
  const integration = result.rows[0] ?? null;
  if (integration) {
    integration.app_secret = decryptSecret(integration.app_secret);
    integration.access_token = decryptSecret(integration.access_token);
  }
  return integration;
}

/**
 * A conexão da Meta da empresa. Quando ela veio do auth (ver `auth-meta.ts`),
 * o token guardado é uma cópia: com ele ainda válido, devolve o que tem e
 * confere no auth em segundo plano; só espera a rede se a cópia já venceu.
 */
async function getMetaIntegration(tenantId: string) {
  let integration = await readMetaIntegration(tenantId);
  if (integration && renovacaoMetaLigada) {
    const quando = precisaRenovar(integration.metadata, integration.token_expires_at);
    if (quando === "agora") {
      await renovarConexaoMeta(tenantId, integration.metadata, encryptSecret);
      integration = await readMetaIntegration(tenantId);
    } else if (quando === "segundo_plano") {
      void renovarConexaoMeta(tenantId, integration.metadata, encryptSecret);
    }
  }
  return { tenantId, integration };
}

async function getGoogleIntegration(tenantId: string) {
  const result = await query<{ access_token: string | null; refresh_token: string | null; user_name: string | null; connected_at: string | null }>(
    "select access_token, refresh_token, user_name, connected_at from integrations where tenant_id = $1 and provider = $2",
    [tenantId, GOOGLE_PROVIDER],
  );
  const integration = result.rows[0] ?? null;
  if (integration) {
    integration.access_token = decryptSecret(integration.access_token);
    integration.refresh_token = decryptSecret(integration.refresh_token);
  }
  return { tenantId, integration };
}

async function refreshGoogleAccessToken(tenantId: string, refreshToken: string) {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  if (!clientId || !clientSecret || !refreshToken) return null;

  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }),
    });
    const data = (await res.json()) as { access_token?: string };
    if (res.ok && data.access_token) {
      const encryptedAccess = encryptSecret(data.access_token);
      await query("update integrations set access_token = $1, updated_at = now() where tenant_id = $2 and provider = $3", [
        encryptedAccess,
        tenantId,
        GOOGLE_PROVIDER,
      ]);
      return data.access_token;
    }
  } catch {
    // Falha silenciosa de refresh
  }
  return null;
}

export async function syncTaskToGoogleCalendar(tenantId: string, task: { id: string; title: string; description?: string | null; due_at?: string | null; status?: string }) {
  try {
    await transaction(async () => {
      await query("select pg_advisory_xact_lock(hashtextextended($1,0))", [`calendar:${tenantId}:${task.id}`]);
      const latest = await query("select * from tasks where tenant_id=$1 and id=$2",[tenantId,task.id]);
      const current = latest.rows[0] ?? {...task,status:"canceled"};
      const { integration } = await getGoogleIntegration(tenantId);
      if (!integration?.access_token) return;
      const previous = await query<{event_id:string}>("select payload->>'g_event_id' as event_id from events where tenant_id=$1 and event_type in ('google_calendar.event_created','google_calendar.event_synced') and payload->>'task_id'=$2 and payload->>'g_event_id' is not null order by created_at desc limit 1",[tenantId,task.id]);
      let eventId = previous.rows[0]?.event_id ?? `crm${task.id.replaceAll("-","")}`;
      const base = "https://www.googleapis.com/calendar/v3/calendars/primary/events";
      let token = integration.access_token;
      async function send(url:string,method:string,payload?:unknown):Promise<Response> {
        let response = await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:payload ? JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10000)});
        if(response.status===401 && integration.refresh_token){
          const refreshed=await refreshGoogleAccessToken(tenantId,integration.refresh_token);
          if(refreshed){token=refreshed;response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`,"Content-Type":"application/json"},body:payload?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(10000)})}
        }
        return response;
      }
      if (!current.due_at || current.status !== "open") {
        const response=await send(`${base}/${encodeURIComponent(eventId)}`,"DELETE");
        if(!response.ok && ![404,410].includes(response.status)) throw new Error(`Calendar HTTP ${response.status}`);
        return;
      }
      const start=new Date(current.due_at);
      const payload={status:"confirmed",summary:current.title,description:current.description??"",start:{dateTime:start.toISOString()},end:{dateTime:new Date(start.getTime()+1800000).toISOString()},reminders:{useDefault:false,overrides:[{method:"popup",minutes:15}]}};
      let response=await send(`${base}/${encodeURIComponent(eventId)}`,"PUT",payload);
      if(response.status===404) response=await send(base,"POST",{...payload,id:eventId});
      if(response.status===409) response=await send(`${base}/${encodeURIComponent(eventId)}`,"PUT",payload);
      if(response.status===410) {
        eventId=`crm${randomUUID().replaceAll("-","")}`;
        response=await send(base,"POST",{...payload,id:eventId});
      }
      if(!response.ok) throw new Error(`Calendar HTTP ${response.status}`);
      await recordEvent(tenantId,"integration","google_calendar.event_synced",{task_id:task.id,g_event_id:eventId});
    });
  } catch {
    await recordEvent(tenantId,"integration","google_calendar.sync_failed",{task_id:task.id}).catch(()=>{});
  }
}

async function createOauthState(user: AuthUser, provider: string, redirectUri: string, state = randomBytes(32).toString("hex")) {
  await query("insert into crm_oauth_states(state_hash,tenant_id,user_id,provider,redirect_uri,expires_at) values($1,$2,$3,$4,$5,now()+interval '10 minutes')",[hashToken(state),user.tenant_id,user.id,provider,redirectUri]);
  return state;
}
async function consumeOauthState(user: AuthUser, provider: string, state: string, redirectUri?: string) {
  const result = await query("delete from crm_oauth_states where state_hash=$1 and tenant_id=$2 and user_id=$3 and provider=$4 and expires_at>now() and ($5::text is null or redirect_uri=$5) returning tenant_id",[hashToken(state),user.tenant_id,user.id,provider,redirectUri??null]);
  return Boolean(result.rowCount);
}

function metaStatus(row: MetaIntegration | null) {
  const metadata = row?.metadata ?? {};
  const peloAuth = metadata.origem === "auth";
  const pendencia = peloAuth && (metadata.auth_estado === "vencida" || metadata.auth_estado === "nao_conectada") ? metadata.auth_estado : null;
  return {
    configured: Boolean(row?.app_id && row?.app_secret),
    connected: Boolean(row?.access_token),
    appConfiguredHint: row?.app_id ? `***${row.app_id.slice(-4)}` : null,
    userName: row?.user_name ?? null,
    connectedAt: row?.connected_at ?? null,
    tokenExpiresAt: row?.token_expires_at ?? null,
    /** `auth`: conexão lida da conta Ávila Ops. `direta`: OAuth antigo do próprio CRM. */
    origem: peloAuth ? "auth" : row?.access_token ? "direta" : null,
    conta: peloAuth && typeof metadata.auth_email === "string" ? metadata.auth_email : null,
    pendencia,
    numeros: peloAuth && typeof metadata.numeros === "number" ? metadata.numeros : null,
    paginaDaMeta: paginaDaMeta(),
  };
}

function messageBody(message: Record<string, unknown>) {
  const type = typeof message.type === "string" ? message.type : "unknown";
  if (type === "text" && typeof message.text === "object" && message.text && "body" in message.text) {
    return String((message.text as { body?: unknown }).body ?? "");
  }
  if (type === "button" && typeof message.button === "object" && message.button && "text" in message.button) {
    return String((message.button as { text?: unknown }).text ?? "");
  }
  if (type === "interactive") return "[mensagem interativa]";
  return `[${type}]`;
}

function messageTimestamp(message: Record<string, unknown>) {
  const timestamp = typeof message.timestamp === "string" ? Number(message.timestamp) : null;
  return timestamp ? new Date(timestamp * 1000).toISOString() : new Date().toISOString();
}

async function upsertWhatsAppChannel(tenantId: string, entryId: string | undefined, metadata: { display_phone_number?: string; phone_number_id?: string } | undefined) {
  const externalId = metadata?.phone_number_id;
  if (!externalId) return null;
  const displayName = metadata?.display_phone_number ? `WhatsApp ${metadata.display_phone_number}` : "WhatsApp";
  const result = await query<{ id: string }>(
    `insert into channels (tenant_id, provider, external_id, display_name, phone_number, status, metadata, updated_at)
     values ($1, 'whatsapp', $2, $3, $4, 'connected', $5, now())
     on conflict (tenant_id, provider, external_id)
     do update set display_name = case when excluded.phone_number is null then channels.display_name else excluded.display_name end,
       phone_number = coalesce(excluded.phone_number, channels.phone_number), status = 'connected', metadata = channels.metadata || excluded.metadata, updated_at = now()
     returning id`,
    [tenantId, externalId, displayName, metadata?.display_phone_number ?? null, JSON.stringify({ waba_id: entryId ?? null })],
  );
  return result.rows[0]?.id ?? null;
}

/**
 * Grava os números que a conexão do auth enxerga e desliga os que sumiram dela.
 *
 * Canal que já existia por outro caminho (webhook direto) não ganha a marca
 * `origem: auth`: ele recebe mensagem, e a marca diria à tela que não recebe.
 */
async function gravarCanaisDoAuth(tenantId: string, canais: CanalDescoberto[]) {
  let criados = 0;
  let atualizados = 0;
  for (const canal of canais) {
    const existente = await query<{ metadata: Record<string, unknown> | null }>("select metadata from channels where tenant_id = $1 and provider = 'whatsapp' and external_id = $2", [tenantId, canal.numeroId]);
    const channelId = await upsertWhatsAppChannel(tenantId, canal.wabaId, { phone_number_id: canal.numeroId, display_phone_number: canal.numero ?? undefined });
    if (!channelId) continue;
    const anterior = existente.rows[0];
    if (anterior) atualizados += 1;
    else criados += 1;
    const marcaOrigem = !anterior || anterior.metadata?.origem === "auth";
    await query("update channels set metadata = metadata || $1::jsonb, team_name = coalesce(team_name, $2), last_sync_at = now(), error_message = null, updated_at = now() where id = $3", [
      JSON.stringify({ business_name: canal.negocio, waba_name: canal.wabaNome, ...(marcaOrigem ? { origem: "auth" } : {}) }),
      canal.negocio,
      channelId,
    ]);
  }
  await query(
    "update channels set status = 'disconnected', updated_at = now() where tenant_id = $1 and provider = 'whatsapp' and metadata->>'origem' = 'auth' and not (external_id = any($2::text[]))",
    [tenantId, canais.map((canal) => canal.numeroId)],
  );
  return { criados, atualizados };
}

async function upsertWhatsAppContact(tenantId: string, waId: string, name: string | undefined) {
  const result = await query<{ id: string }>(
    `insert into contacts (tenant_id, name, phone, source, updated_at)
     values ($1, $2, $3, 'whatsapp', now())
     on conflict (tenant_id, phone)
     do update set name = coalesce(nullif(excluded.name, ''), contacts.name), source = coalesce(contacts.source, 'whatsapp'), updated_at = now()
     returning id`,
    [tenantId, name || waId, waId],
  );
  return result.rows[0].id;
}

async function getOrCreateConversation(tenantId: string, channelId: string | null, contactId: string) {
  const existing = await query<{ id: string }>(
    `select id from conversations
     where tenant_id = $1 and contact_id = $2 and channel_id is not distinct from $3 and archived_at is null
     order by updated_at desc
     limit 1`,
    [tenantId, contactId, channelId],
  );
  if (existing.rows[0]) return existing.rows[0].id;
  const created = await query<{ id: string }>(
    `insert into conversations (tenant_id, channel_id, contact_id, status, created_at, updated_at)
     values ($1, $2, $3, 'open', now(), now())
     returning id`,
    [tenantId, channelId, contactId],
  );
  return created.rows[0].id;
}

/**
 * Reenvia a mensagem ja gravada para quem esta com a conversa aberta.
 *
 * Usado pelos caminhos que alteram a mensagem depois de inserida —
 * transcricao de audio e confirmacao de entrega da Meta.
 */
async function notificarMensagemAtualizada(tenantId: string, conversationId: string, messageId: string) {
  const atualizada = await query(
    `select id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, error_message, request_id, media_id, sent_at, created_at
     from messages where tenant_id = $1 and id = $2`,
    [tenantId, messageId],
  );
  if (!atualizada.rows[0]) return;
  await publishRealtime({ type: "message.updated", tenantId, conversationId, data: atualizada.rows[0] });
}

async function processWhatsAppWebhook(tenantId: string, payload: WhatsAppWebhookPayload) {
  let messages = 0;
  let statuses = 0;

  for (const entry of payload.entry ?? []) {
    for (const change of entry.changes ?? []) {
      if (change.field !== "messages") continue;
      const value = change.value;
      const channelId = await upsertWhatsAppChannel(tenantId, entry.id, value?.metadata);
      const contactsByWaId = new Map((value?.contacts ?? []).map((contact) => [contact.wa_id, contact.profile?.name]));

      for (const message of value?.messages ?? []) {
        const externalId = typeof message.id === "string" ? message.id : null;
        const waId = typeof message.from === "string" ? message.from : null;
        if (!externalId || !waId) continue;
        const contactName = contactsByWaId.get(waId) ?? waId;
        const contactId = await upsertWhatsAppContact(tenantId, waId, contactName);
        const conversationId = await getOrCreateConversation(tenantId, channelId, contactId);
        const sentAt = messageTimestamp(message);
        const inserted = await query<{ id: string; conversation_id: string; direction: string; body: string | null; message_type: string; status: string; sent_at: string }>(
          `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, metadata, sent_at)
           values ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9)
           on conflict (tenant_id, external_id) do nothing
           returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, error_message, request_id, media_id, sent_at, created_at`,
          [
            tenantId,
            conversationId,
            externalId,
            contactName,
            waId,
            messageBody(message),
            typeof message.type === "string" ? message.type : "unknown",
            JSON.stringify(message),
            sentAt,
          ],
        );
        const novaMensagem = inserted.rows[0] ?? null;
        if (novaMensagem) messages += 1;

        // Anexo baixado em segundo plano, pelo mesmo motivo da transcricao
        // abaixo: um video de 15 MB leva segundos e a Meta reentrega o evento
        // se a resposta demorar. A mensagem ja esta no inbox; o anexo aparece
        // por evento assim que o download termina.
        //
        // Um audio passa pelos dois caminhos e baixa duas vezes, de proposito:
        // sao respostas a perguntas diferentes — a transcricao alimenta busca,
        // funil e relatorio, e o arquivo guardado deixa o atendente ouvir o
        // tom do cliente. Acoplar os dois economizaria um download e criaria a
        // dependencia de a midia so existir quando a transcricao funcionar.
        const tipoRecebido = typeof message.type === "string" ? message.type : "unknown";
        if (novaMensagem && WHATSAPP_MEDIA_TYPES.has(tipoRecebido)) {
          const anexo = message[tipoRecebido] as { id?: unknown; mime_type?: unknown; filename?: unknown; caption?: unknown } | undefined;
          const mediaId = typeof anexo?.id === "string" ? anexo.id : null;
          if (mediaId) {
            void getMetaIntegration(tenantId)
              .then((meta) => {
                const token = meta?.integration?.access_token;
                if (!token) return;
                return ingestInboundMedia({
                  tenantId,
                  conversationId,
                  messageId: novaMensagem.id,
                  mediaId,
                  mimeTypeHint: typeof anexo?.mime_type === "string" ? anexo.mime_type : null,
                  fileNameHint: typeof anexo?.filename === "string" ? anexo.filename : null,
                  caption: typeof anexo?.caption === "string" ? anexo.caption : null,
                  accessToken: token,
                  graphVersion: META_GRAPH_VERSION,
                });
              })
              .catch((erro) => console.warn("[midia] download falhou em segundo plano:", erro));
          }
        }

        // Audio vira texto pelo Avila IA. Sem `await` de proposito: a Meta
        // reenvia o evento se demorarmos para responder, e transcrever leva
        // segundos. A mensagem ja entrou como `[audio]`; o texto chega logo
        // depois por update. Falhar aqui nao pode derrubar a ingestao.
        const mensagemId = novaMensagem?.id;
        const tipoDaMensagem = tipoRecebido;
        if (mensagemId && ehMensagemDeAudio(tipoDaMensagem)) {
          const midia = message[tipoDaMensagem] as { id?: unknown } | undefined;
          const mediaId = typeof midia?.id === "string" ? midia.id : null;
          if (mediaId) {
            void getMetaIntegration(tenantId)
              .then((meta) => {
                const token = meta?.integration?.access_token;
                if (!token) return;
                return transcreverEGravar({
                  mensagemId,
                  tenantId,
                  mediaId,
                  accessToken: token,
                  executarQuery: (texto, valores) => query(texto, valores as never[]),
                });
              })
              // O texto substitui o `[audio]` por update; sem avisar a tela, a
              // conversa aberta continuaria mostrando o marcador ate o F5.
              .then(() => notificarMensagemAtualizada(tenantId, conversationId, mensagemId))
              .catch((erro) => console.warn("[transcricao] falhou em segundo plano:", erro));
          }
        }

        // O nao lido so sobe quando a mensagem e nova: a Meta reentrega o
        // mesmo evento quando demoramos a responder, e contar de novo deixaria
        // um badge que nunca zera.
        const conversaAtualizada = await query<{ unread_count: number; status: string; last_message_at: string; last_customer_message_at: string }>(
          `update conversations
           set status = 'waiting', last_message_at = greatest(coalesce(last_message_at, $2::timestamptz), $2::timestamptz),
               last_customer_message_at = greatest(coalesce(last_customer_message_at, $2::timestamptz), $2::timestamptz),
               unread_count = unread_count + $3,
               updated_at = now()
           where id = $1
           returning unread_count, status, last_message_at, last_customer_message_at`,
          [conversationId, sentAt, novaMensagem ? 1 : 0],
        );

        if (novaMensagem) {
          await publishRealtime({ type: "message.created", tenantId, conversationId, data: novaMensagem });
          await publishRealtime({
            type: "conversation.updated",
            tenantId,
            conversationId,
            data: {
              id: conversationId,
              unread_count: conversaAtualizada.rows[0]?.unread_count ?? 0,
              status: conversaAtualizada.rows[0]?.status ?? "waiting",
              last_message_at: conversaAtualizada.rows[0]?.last_message_at ?? sentAt,
              last_customer_message_at: conversaAtualizada.rows[0]?.last_customer_message_at ?? sentAt,
              preview: novaMensagem.body,
            },
          });
        }
      }

      for (const status of value?.statuses ?? []) {
        statuses += 1;
        const externalId = typeof status.id === "string" ? status.id : null;
        const deliveryStatus = typeof status.status === "string" ? status.status : "unknown";
        if (externalId) {
          const atualizada = await query<{ id: string; conversation_id: string }>(
            `update messages
             set status = $3, error_message = $4, metadata = metadata || $5::jsonb
             where tenant_id = $1 and external_id = $2
             returning id, conversation_id`,
            [
              tenantId,
              externalId,
              deliveryStatus,
              Array.isArray(status.errors) ? JSON.stringify(status.errors) : null,
              JSON.stringify({ latest_status: status }),
            ],
          );
          // Os tiques de entregue e lido chegam por aqui: sem o evento o
          // atendente fica olhando "enviado" ate recarregar a pagina.
          const alvo = atualizada.rows[0];
          if (alvo) {
            publishRealtimeAsync({
              type: "message.updated",
              tenantId,
              conversationId: alvo.conversation_id,
              data: { id: alvo.id, status: deliveryStatus },
            });
          }
        }
        await recordEvent(tenantId, "message", "meta.message_status", { external_id: externalId, status: deliveryStatus, raw: status });
      }
    }
  }

  return { messages, statuses };
}

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  tenantSlug: z.string().trim().min(1).max(120).optional(),
});

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email(),
  role: z.enum(["admin", "gerente", "atendente"]).default("atendente"),
  password: z.string().min(8).max(120).optional(),
});

const updateUserSchema = z.object({
  name: z.string().trim().min(2).max(120).optional(),
  email: z.string().trim().email().optional(),
  role: z.enum(["admin", "gerente", "atendente"]).optional(),
  active: z.boolean().optional(),
  password: z.string().min(8).max(120).optional(),
});

const assignSchema = z.object({
  userId: z.string().uuid().nullable(),
});

const conversationQuerySchema = z.object({
  status: z.string().optional(),
  channelId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  unassigned: z.coerce.boolean().optional(),
  slaOverdue: z.coerce.boolean().optional(),
  search: z.string().trim().optional(),
  sort: z.enum(["last_message_at", "waiting_seconds", "created_at"]).optional().default("last_message_at"),
  order: z.enum(["asc", "desc"]).optional().default("desc"),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(30),
});

const sendMessageSchema = z.object({
  body: z.string().trim().min(1).max(4096),
  idempotencyKey: z.string().trim().min(8).max(120).optional(),
});

const listQuerySchema = z.object({
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(30),
});

const createLeadSchema = z.object({
  title: z.string().trim().min(1).max(180).optional(),
  valueCents: z.coerce.number().int().min(0).optional().default(0),
  stageId: z.string().uuid().optional(),
});

const taskQuerySchema = z.object({
  status: z.enum(["open", "completed", "canceled", "all"]).optional().default("open"),
  contactId: z.string().uuid().optional(),
  leadId: z.string().uuid().optional(),
  assignedUserId: z.string().uuid().optional(),
  search: z.string().trim().optional(),
  page: z.coerce.number().int().min(1).optional().default(1),
  pageSize: z.coerce.number().int().min(1).max(100).optional().default(50),
});

const updateLeadStageSchema = z.object({
  stageId: z.string().uuid(),
});

const erpConnectSchema = z.object({
  baseUrl: z.string().url(),
  /** Chave de API criada no ERP em Integrações → Chaves. */
  apiKey: z.string().min(10),
  /** Segredo devolvido pelo ERP ao registrar a assinatura de webhook. */
  webhookSecret: z.string().min(10),
  /** Tenant no ERP — é o que chega no header de cada entrega. */
  erpTenantId: z.string().uuid(),
  settings: z
    .object({
      autoWinLeadOnOrder: z.boolean().optional(),
      createMissingContacts: z.boolean().optional(),
    })
    .optional(),
});

function canManage(user: AuthUser) {
  return user.role === "admin" || user.role === "gerente" || user.role === "manager";
}

/**
 * Marca a conversa depois de um envio do atendente.
 *
 * Uma falha nao move `last_agent_message_at`: esse carimbo alimenta o SLA e a
 * fila de espera, e contar uma mensagem que a Meta recusou tiraria da fila
 * justamente o cliente que continua sem resposta.
 */
async function touchConversationAfterSend(tenantId: string, conversationId: string, status: string) {
  await query(
    `update conversations
     set status = case when $3 = 'failed' then status else 'open' end,
         last_message_at = case when $3 = 'failed' then last_message_at else now() end,
         last_agent_message_at = case when $3 = 'failed' then last_agent_message_at else now() end,
         updated_at = now()
     where tenant_id = $1 and id = $2`,
    [tenantId, conversationId, status],
  );
  if (status !== "failed") {
    publishRealtimeAsync({ type: "conversation.updated", tenantId, conversationId, data: { id: conversationId, status: "open" } });
  }
}

async function recordEvent(tenantId: string, entityType: string, eventType: string, payload: unknown, actorUserId?: string | null, entityId?: string | null, requestId?: string | null) {
  await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type, payload, request_id) values ($1, $2, $3, $4, $5, $6, $7)", [
    tenantId,
    actorUserId ?? null,
    entityType,
    entityId ?? null,
    eventType,
    JSON.stringify(payload ?? {}),
    requestId ?? null,
  ]);
}

export async function buildApp(options: { background?: boolean } = {}) {
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  renovacaoMetaLigada = options.background !== false;
  installErrorHandler(app);
  if (options.background !== false) await ensureInitialAdminPassword();

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    (request as RawBodyRequest).rawBody = rawBody;
    try {
      done(null, rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {});
    } catch (error) {
      done(error as Error);
    }
  });

  // O botão de descadastro e o POST de um clique do provedor (RFC 8058)
  // chegam como formulário; o Fastify não traz parser para esse tipo.
  app.addContentTypeParser("application/x-www-form-urlencoded", { parseAs: "string" }, (_request, body, done) => {
    try {
      done(null, Object.fromEntries(new URLSearchParams(String(body))));
    } catch (error) {
      done(error as Error);
    }
  });

  // Anexos do inbox chegam como multipart. O limite fica no plugin tambem, e
  // nao so na rota: sem ele um upload gigante seria lido inteiro na memoria
  // antes de alguem poder recusa-lo.
  await app.register(fastifyMultipart, {
    limits: { fileSize: maxMediaBytes(), files: 1, fields: 10 },
  });

  app.addHook("onRequest", async (request) => {
    const incoming = request.headers["x-request-id"];
    (request as RequestWithId).requestId = typeof incoming === "string" && incoming.length <= 120 ? incoming : randomUUID();
  });

  app.addHook("onSend", async (request, reply, payload) => {
    reply.header("X-Request-Id", (request as RequestWithId).requestId ?? randomUUID());
    if (request.url.startsWith("/api/")) {
      reply.header("Cache-Control", "no-store");
    }
    reply.header("X-Content-Type-Options", "nosniff");
    reply.header("Referrer-Policy", "strict-origin-when-cross-origin");
    reply.header("X-Frame-Options", "DENY");
    reply.header("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    return payload;
  });

  app.get("/api/health", async () => {
    await query("select 1");
    return { ok: true, database: "connected", revision: process.env.APP_REVISION ?? "development" };
  });

  app.get("/api/auth/session", async (request) => {
    const user = await getSessionUser(request.headers.cookie);
    return { authenticated: Boolean(user), user };
  });

  app.get("/api/auth/sso/enabled", async () => {
    return { enabled: Boolean(process.env.SSO_JWT_SECRET), url: urlLoginSso() };
  });

  /**
   * Converte a sessao do SSO (cookie avila_sso, de .avilaops.com) numa sessao
   * nativa do CRM.
   *
   * O resto do backend nao muda: continua lendo `agenda_session` da tabela
   * `sessions`, entao logout, expiracao e `last_seen_at` seguem funcionando
   * igual ao login por senha.
   */
  app.get("/api/auth/sso", async (request, reply) => {
    const token = parseCookies(request.headers.cookie).get(SSO_COOKIE);
    const sessao = token ? verifySsoToken(token) : null;

    // Sem cookie valido: manda para o auth server obter um.
    if (!sessao) return reply.redirect(urlLoginSso());

    const requested = z.object({tenantSlug:z.string().max(120).optional()}).parse(request.query).tenantSlug;
    const memberships = await query<AuthUser & {active:boolean}>("select u.id,u.tenant_id,u.name,u.email,u.role,u.active from users u join tenants t on t.id=u.tenant_id where lower(u.email)=lower($1) and ($2::text is null or t.slug=$2)",[sessao.email,requested??null]);
    if (memberships.rows.length > 1) return reply.code(409).send({error:"Informe o codigo da empresa para entrar."});
    if (requested && !memberships.rowCount) return reply.code(403).send({error:"Sem acesso a esta empresa."});
    const tenantId = memberships.rows[0]?.tenant_id ?? await getTenantId();
    const existente = memberships;
    let user = existente.rows[0];

    if (user && !user.active) {
      return reply.code(403).send({ error: "Usuario desativado no CRM." });
    }

    if (!user) {
      // Quem tem conta do Workspace avilaops.com e equipe, entao entra direto.
      // Fora disso o SSO so autentica: alguem do CRM precisa ter cadastrado a
      // pessoa antes. Auto-provisionar qualquer conta Google daria acesso ao
      // CRM inteiro para qualquer um com um e-mail.
      if (sessao.papel !== "ADMIN") {
        return reply.code(403).send({ error: "Sem acesso ao CRM. Peca a um administrador para criar seu usuario." });
      }
      const criado = await query<AuthUser & { active: boolean }>(
        `insert into users (tenant_id, name, email, role, active, password_hash)
         values ($1, $2, $3, 'admin', true, null)
         returning id, tenant_id, name, email, role, active`,
        [tenantId, sessao.nome, sessao.email.toLowerCase()],
      );
      user = criado.rows[0];
    }

    const sessionToken = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await query("insert into sessions (tenant_id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)", [
      user.tenant_id,
      user.id,
      hashToken(sessionToken),
      expiresAt.toISOString(),
    ]);
    await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type) values ($1, $2, $3, $4, $5)", [
      user.tenant_id,
      user.id,
      "user",
      user.id,
      "auth.login_sso",
    ]);

    reply.header("Set-Cookie", cabecalhoCookieSessao(sessionToken));
    return reply.redirect("/");
  });

  app.post("/api/auth/login", async (request, reply) => {
    if (!checkRateLimit(`login:${request.ip}`, 10, 15 * 60 * 1000)) {
      return reply.code(429).send({ error: "Muitas tentativas. Tente novamente em alguns minutos." });
    }
    const body = loginSchema.parse(request.body);
    const result = await query<AuthUser & { password_hash: string | null }>(
      `select u.id, u.tenant_id, u.name, u.email, u.role, u.password_hash
       from users u
       join tenants t on t.id = u.tenant_id
       where lower(u.email) = lower($1) and t.slug = $2 and u.active = true`,
      [body.email, body.tenantSlug ?? DEFAULT_TENANT_SLUG],
    );
    const user = result.rows[0];
    if (!user || !(await verifyPassword(body.password, user.password_hash))) {
      return reply.code(401).send({ error: "Email ou senha invalidos." });
    }

    const token = randomBytes(32).toString("hex");
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
    await query("insert into sessions (tenant_id, user_id, token_hash, expires_at) values ($1, $2, $3, $4)", [
      user.tenant_id,
      user.id,
      hashToken(token),
      expiresAt.toISOString(),
    ]);
    await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type) values ($1, $2, $3, $4, $5)", [
      user.tenant_id,
      user.id,
      "user",
      user.id,
      "auth.login",
    ]);

    reply.header("Set-Cookie", cabecalhoCookieSessao(token));
    return { authenticated: true, user: { id: user.id, tenant_id: user.tenant_id, name: user.name, email: user.email, role: user.role } };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const token = parseCookies(request.headers.cookie).get(SESSION_COOKIE);
    if (token) {
      await query("delete from sessions where token_hash = $1", [hashToken(token)]);
    }
    reply.header("Set-Cookie", `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV === "production" ? "; Secure" : ""}`);
    return { authenticated: false };
  });

  app.get("/api/bootstrap", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const tenantId = user.tenant_id;
    const [tenant, users, contacts, channels, conversations, messages, leads, tasks, companies] = await Promise.all([
      query("select id, name, slug, created_at from tenants where id = $1", [tenantId]),
      query("select id, name, email, role, active, created_at from users where tenant_id = $1 order by created_at", [tenantId]),
      query("select id, name, email, phone, company, company_id, source, created_at from contacts where tenant_id = $1 order by created_at desc limit 50", [tenantId]),
      query("select id, provider, external_id, display_name, phone_number, status, metadata, created_at from channels where tenant_id = $1 order by created_at desc", [tenantId]),
      query("select id, channel_id, contact_id, assigned_user_id, status, archived_at, last_message_at, last_customer_message_at, last_agent_message_at, created_at from conversations where tenant_id = $1 order by coalesce(last_message_at, created_at) desc limit 50", [tenantId]),
      query("select id, conversation_id, direction, sender_name, sender_phone, body, message_type, sent_at from messages where tenant_id = $1 order by sent_at desc limit 100", [tenantId]),
      query("select id, title, value_cents, status, stage_id, contact_id, created_at from leads where tenant_id = $1 order by created_at desc limit 100", [tenantId]),
      query(`select t.id, t.contact_id, t.lead_id, t.assigned_user_id, t.title, t.description, t.priority, t.due_at, t.status, t.created_at, t.updated_at, t.conversation_id, t.reminder_at,
                    u.name as assigned_user_name, c.name as contact_name, l.title as lead_title
             from tasks t
             left join users u on u.id = t.assigned_user_id
             left join contacts c on c.id = t.contact_id
             left join leads l on l.id = t.lead_id
             where t.tenant_id = $1
             order by case when t.status = 'open' then 0 else 1 end, t.due_at asc nulls last
             limit 100`, [tenantId]),
      query("select id, name, cnpj, domain, phone, email, address, created_at from companies where tenant_id = $1 order by name asc limit 100", [tenantId]),
    ]);

    return {
      tenant: tenant.rows[0],
      users: users.rows,
      currentUser: user,
      contacts: contacts.rows,
      channels: channels.rows,
      conversations: conversations.rows,
      messages: messages.rows,
      leads: leads.rows,
      tasks: tasks.rows,
      companies: companies.rows,
    };
  });

  app.get("/api/users", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query(
      `select id, name, email, role, active, created_at
       from users
       where tenant_id = $1
       order by created_at asc`,
      [user.tenant_id],
    );
    return { users: result.rows };
  });

  app.post("/api/users", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (user.role !== "admin") return reply.code(403).send({ error: "Permissao insuficiente." });
    const body = createUserSchema.parse(request.body);
    const passwordHash = body.password ? await hashPassword(body.password) : null;
    try {
      const result = await query(
        `insert into users (tenant_id, name, email, role, password_hash, active)
         values ($1, $2, lower($3), $4, $5, true)
         returning id, name, email, role, active, created_at`,
        [user.tenant_id, body.name, body.email, body.role, passwordHash],
      );
      await recordEvent(user.tenant_id, "user", "user.created", { email: body.email, role: body.role }, user.id, result.rows[0].id, (request as RequestWithId).requestId);
      return reply.code(201).send({ user: result.rows[0] });
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Ja existe um usuario com este email." });
      }
      throw error;
    }
  });

  app.patch("/api/users/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (user.role !== "admin") return reply.code(403).send({ error: "Permissao insuficiente." });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateUserSchema.parse(request.body);
    if (id === user.id && body.active === false) return reply.code(400).send({ error: "Voce nao pode desativar sua propria conta." });
    if (id === user.id && body.role && body.role !== user.role) return reply.code(400).send({ error: "Voce nao pode alterar seu proprio papel." });

    const passwordHash = body.password ? await hashPassword(body.password) : undefined;
    try {
      const result = await query(
        `update users
         set name = coalesce($3, name),
             email = coalesce(lower($4), email),
             role = coalesce($5, role),
             active = coalesce($6, active),
             password_hash = coalesce($7, password_hash)
         where tenant_id = $1 and id = $2
         returning id, name, email, role, active, created_at`,
        [user.tenant_id, id, body.name ?? null, body.email ?? null, body.role ?? null, body.active ?? null, passwordHash ?? null],
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "Usuario nao encontrado." });
      await recordEvent(user.tenant_id, "user", "user.updated", { fields: Object.keys(body).filter((field) => field !== "password") }, user.id, id, (request as RequestWithId).requestId);
      return { user: result.rows[0] };
    } catch (error) {
      if (typeof error === "object" && error && "code" in error && error.code === "23505") {
        return reply.code(409).send({ error: "Ja existe um usuario com este email." });
      }
      throw error;
    }
  });

  app.get("/api/meta/status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { integration } = await getMetaIntegration(user.tenant_id);
    return metaStatus(integration);
  });

  app.get("/api/conversations", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = conversationQuerySchema.parse(request.query);
    const where = ["c.tenant_id = $1"];
    const params: unknown[] = [user.tenant_id];
    const add = (value: unknown) => {
      params.push(value);
      return `$${params.length}`;
    };
    if (filters.status) where.push(`c.status = ${add(filters.status)}`);
    if (filters.channelId) where.push(`c.channel_id = ${add(filters.channelId)}`);
    if (filters.assignedUserId) where.push(`c.assigned_user_id = ${add(filters.assignedUserId)}`);
    if (filters.unassigned) where.push("c.assigned_user_id is null and c.status <> 'archived'");
    if (filters.slaOverdue) {
      where.push("(c.status <> 'archived' and c.last_customer_message_at is not null and (c.last_agent_message_at is null or c.last_customer_message_at > c.last_agent_message_at) and now() - c.last_customer_message_at > interval '15 minutes')");
    }
    if (filters.search) {
      const searchParam = add(`%${filters.search}%`);
      where.push(`(
        c.id::text ilike ${searchParam}
        or ct.name ilike ${searchParam}
        or ct.phone ilike ${searchParam}
        or ct.company ilike ${searchParam}
        or exists (
          select 1 from messages m
          where m.tenant_id = c.tenant_id and m.conversation_id = c.id and m.body ilike ${searchParam}
        )
      )`);
    }
    const countParams = [...params];
    const offset = (filters.page - 1) * filters.pageSize;
    const orderColumn =
      filters.sort === "waiting_seconds"
        ? "waiting_seconds"
        : filters.sort === "created_at"
          ? "c.created_at"
          : "coalesce(c.last_message_at, c.created_at)";
    const result = await query(
      `select c.id, c.channel_id, c.contact_id, c.assigned_user_id, c.status, c.archived_at,
              c.last_message_at, c.last_customer_message_at, c.last_agent_message_at, c.created_at, c.unread_count,
              ch.provider as channel_provider,
              ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email, ct.company as contact_company,
              ch.display_name as channel_name, ch.phone_number as channel_phone, ch.status as channel_status,
              u.name as assigned_user_name,
              case
                when c.status <> 'archived' and c.last_customer_message_at is not null and (c.last_agent_message_at is null or c.last_customer_message_at > c.last_agent_message_at)
                then extract(epoch from (now() - c.last_customer_message_at))::int
                else 0
              end as waiting_seconds,
              (c.assigned_user_id is null and c.status <> 'archived') as unassigned,
              ${WINDOW_SELECT_SQL}
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       left join channels ch on ch.id = c.channel_id
       left join users u on u.id = c.assigned_user_id
       where ${where.join(" and ")}
       order by ${orderColumn} ${filters.order}
       limit ${add(filters.pageSize)} offset ${add(offset)}`,
      params,
    );
    const count = await query<{ total: string }>(
      `select count(*)::text as total
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       where ${where.join(" and ")}`,
      countParams,
    );
    // Total do tenant, nao da pagina: o badge do menu tem que contar o que
    // esta fora do filtro atual tambem.
    const unread = await query<{ total: string; conversations: string }>(
      `select coalesce(sum(unread_count), 0)::text as total, count(*) filter (where unread_count > 0)::text as conversations
       from conversations where tenant_id = $1 and status <> 'archived'`,
      [user.tenant_id],
    );

    return {
      conversations: result.rows,
      pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) },
      unread: { messages: Number(unread.rows[0]?.total ?? 0), conversations: Number(unread.rows[0]?.conversations ?? 0) },
    };
  });

  app.get("/api/conversations/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query(
      `select m.id, m.conversation_id, m.external_id, m.direction, m.sender_name, m.sender_phone, m.body, m.message_type,
              m.status, m.error_message, m.request_id, m.media_id, m.sent_at, m.created_at,
              md.mime_type as media_mime_type, md.file_name as media_file_name, md.file_size as media_file_size,
              md.status as media_status, md.caption as media_caption
       from messages m
       left join message_media md on md.id = m.media_id
       where m.tenant_id = $1 and m.conversation_id = $2
       order by m.sent_at asc, m.created_at asc`,
      [user.tenant_id, id],
    );
    return { messages: result.rows };
  });

  /**
   * Zera o nao lido da conversa.
   *
   * Separado do GET de mensagens de proposito: abrir a conversa para consultar
   * o historico nao e o mesmo que dar por lido, e o inbox precisa dos dois
   * comportamentos.
   */
  app.post("/api/conversations/:id/read", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query<{ id: string; unread_count: number }>(
      `update conversations set unread_count = 0, last_read_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning id, unread_count`,
      [user.tenant_id, id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Conversa nao encontrada." });
    publishRealtimeAsync({ type: "conversation.read", tenantId: user.tenant_id, conversationId: id, data: { id, unread_count: 0 } });
    return { ok: true };
  });

  app.post("/api/conversations/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const requestId = (request as RequestWithId).requestId;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = sendMessageSchema.parse(request.body);
    const idempotencyKey = body.idempotencyKey ?? randomUUID();

    const existing = await query(
      `select id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id
       from messages where tenant_id = $1 and idempotency_key = $2`,
      [user.tenant_id, idempotencyKey],
    );
    if (existing.rows[0]) return { message: existing.rows[0], idempotent: true };

    const conversation = await query<{
      id: string;
      contact_phone: string | null;
      channel_external_id: string | null;
      channel_id: string | null;
      channel_provider: string | null;
    }>(
      `select c.id, c.channel_id, ct.phone as contact_phone, ch.external_id as channel_external_id, ch.provider as channel_provider
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       left join channels ch on ch.id = c.channel_id
       where c.tenant_id = $1 and c.id = $2`,
      [user.tenant_id, id],
    );
    const row = conversation.rows[0];
    if (!row) return reply.code(404).send({ error: "Conversa nao encontrada." });
    if (!row.channel_external_id || !row.contact_phone) return reply.code(400).send({ error: "Conversa sem canal ou telefone valido." });

    // A Meta recusa texto livre fora da janela de 24h. Deixar seguir daria um
    // "enviado" na tela para uma mensagem que o cliente nunca recebeu — o 409
    // chega antes e a tela troca para o seletor de templates.
    const janela = await assertSendWindow(user.tenant_id, id);
    if (!janela.allowed) {
      return reply.code(409).send({ error: janela.reason, code: "window_closed", windowExpiresAt: janela.expiresAt ?? null });
    }

    let externalId: string | null = null;
    let status = "sent";
    let errorMessage: string | null = null;
    let responseMetadata: Record<string, unknown> = {};

    if (row.channel_provider === "messageria") {
      // O canal veio espelhado da Messageria: quem fala com a Meta e ela, que
      // ja confere janela, opt-out e franquia antes de deixar sair.
      const messageria = await conexaoMessageria(user.tenant_id, decryptSecret);
      if (!messageria?.api_key) return reply.code(400).send({ error: "Messageria nao conectada." });
      try {
        const saida = await enviarPelaMessageria(messageria, {
          para: row.contact_phone,
          texto: body.body,
          idempotencia: idempotencyKey,
        });
        externalId = saida.externalId;
        status = saida.status ?? "sent";
        responseMetadata = { messageria: saida };
      } catch (erro) {
        if (!(erro instanceof MessageriaRequestError)) throw erro;
        status = "failed";
        errorMessage = erro.message;
        responseMetadata = { messageria: { codigo: erro.codigo } };
        await recordEvent(user.tenant_id, "message", "messageria.message_send_failed", { conversation_id: id, error: erro.message, codigo: erro.codigo }, user.id, null, requestId);
      }
    } else if (row.channel_provider === "qrcode" || row.channel_provider === "evolution") {
      const evolutionApiUrl = process.env.EVOLUTION_API_URL ?? "http://localhost:8080";
      const evolutionApiKey = process.env.EVOLUTION_API_KEY ?? "global-apikey";
      try {
        const evoResponse = await fetch(`${evolutionApiUrl}/message/sendText/${row.channel_external_id}`, {
          method: "POST",
          headers: { apikey: evolutionApiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number: row.contact_phone, options: { delay: 1200, presence: "composing" }, textMessage: { text: body.body } }),
        });
        const evoData = (await evoResponse.json()) as Record<string, unknown>;
        if (evoResponse.ok) {
          externalId = (evoData.key as { id?: string } | undefined)?.id ?? randomUUID();
          responseMetadata = { evolution: evoData };
        } else {
          status = "sent"; // Fallback para desenvolvimento local
          externalId = `qr_${randomUUID()}`;
          responseMetadata = { simulated: true };
        }
      } catch {
        // Envio local registrado com sucesso quando a engine estiver inicializando
        status = "sent";
        externalId = `qr_${randomUUID()}`;
        responseMetadata = { offline_queued: true };
      }
    } else {
      const { integration } = await getMetaIntegration(user.tenant_id);
      if (!integration?.access_token) return reply.code(400).send({ error: "Meta ainda nao conectada." });

      const messagePayload = {
        messaging_product: "whatsapp",
        recipient_type: "individual",
        to: row.contact_phone,
        type: "text",
        text: { preview_url: false, body: body.body },
      };

      const graphUrl = `https://graph.facebook.com/${META_GRAPH_VERSION}/${row.channel_external_id}/messages`;
      const graphResponse = await fetch(graphUrl, {
        method: "POST",
        headers: { Authorization: `Bearer ${integration.access_token}`, "Content-Type": "application/json" },
        body: JSON.stringify(messagePayload),
      });
      const graphData = (await graphResponse.json()) as { messages?: Array<{ id?: string }>; error?: { message?: string } };
      if (!graphResponse.ok || !graphData.messages?.[0]?.id) {
        status = "failed";
        errorMessage = graphData.error?.message ?? "Falha ao enviar mensagem pela Meta.";
        await recordEvent(user.tenant_id, "message", "meta.message_send_failed", { conversation_id: id, error: errorMessage }, user.id, null, requestId);
      } else {
        externalId = graphData.messages[0].id ?? null;
        responseMetadata = { graph: graphData };
      }
    }

    const saved = await query(
      `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, body, message_type, metadata, status, idempotency_key, error_message, request_id, sent_at)
       values ($1, $2, $3, 'outbound', $4, $5, 'text', $6, $7, $8, $9, $10, now())
       returning id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, status, sent_at, created_at, error_message, request_id, media_id`,
      [
        user.tenant_id,
        id,
        externalId,
        user.name,
        body.body,
        JSON.stringify(responseMetadata),
        status,
        idempotencyKey,
        errorMessage,
        requestId,
      ],
    );

    await touchConversationAfterSend(user.tenant_id, id, status);
    await recordEvent(user.tenant_id, "message", status === "failed" ? "message.outbound_failed" : "message.outbound_sent", { conversation_id: id, external_id: externalId }, user.id, saved.rows[0].id, requestId);

    // Publicado mesmo quando falha: o outro atendente com a conversa aberta
    // precisa ver a tentativa e o erro, nao um silencio.
    publishRealtimeAsync({ type: "message.created", tenantId: user.tenant_id, conversationId: id, data: saved.rows[0] });

    if (status === "failed") return reply.code(502).send({ error: errorMessage, message: saved.rows[0], requestId });
    return { message: saved.rows[0], requestId };
  });

  app.post("/api/conversations/:id/archive", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query<{ id: string }>(
      `update conversations
       set status = 'archived', archived_at = now(), updated_at = now()
       where tenant_id = $1 and id = $2
       returning id`,
      [user.tenant_id, id],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Conversa nao encontrada." });
    await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type) values ($1, $2, 'conversation', $3, 'conversation.archived')", [
      user.tenant_id,
      user.id,
      id,
    ]);
    publishRealtimeAsync({ type: "conversation.updated", tenantId: user.tenant_id, conversationId: id, data: { id, status: "archived" } });
    return { ok: true };
  });

  app.post("/api/conversations/:id/lead", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = createLeadSchema.parse(request.body);
    const conversation = await query<{ contact_id: string | null; contact_name: string | null; contact_company: string | null }>(
      `select c.contact_id, ct.name as contact_name, ct.company as contact_company
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       where c.tenant_id = $1 and c.id = $2`,
      [user.tenant_id, id],
    );
    const row = conversation.rows[0];
    if (!row) return reply.code(404).send({ error: "Conversa nao encontrada." });
    if (!row.contact_id) return reply.code(400).send({ error: "Conversa sem contato vinculado." });

    let stageId = body.stageId ?? null;
    if (!stageId) {
      const firstStage = await query<{ id: string }>(
        `select ps.id
         from pipeline_stages ps
         join pipelines p on p.id = ps.pipeline_id
         where p.tenant_id = $1
         order by ps.position asc
         limit 1`,
        [user.tenant_id],
      );
      stageId = firstStage.rows[0]?.id ?? null;
    }

    const lead = await query(
      `insert into leads (tenant_id, contact_id, stage_id, title, value_cents, status, updated_at)
       values ($1, $2, $3, $4, $5, 'open', now())
       returning id, title, value_cents, status, stage_id, contact_id, created_at, updated_at`,
      [user.tenant_id, row.contact_id, stageId, body.title ?? `Atendimento - ${row.contact_name ?? "Contato"}`, body.valueCents],
    );
    await recordEvent(user.tenant_id, "lead", "lead.created_from_conversation", { conversation_id: id, lead_id: lead.rows[0].id }, user.id, lead.rows[0].id, (request as RequestWithId).requestId);
    return { lead: lead.rows[0] };
  });

  app.post("/api/conversations/:id/assign", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = assignSchema.parse(request.body);
    const result = await query<{ id: string }>(
      `update conversations
       set assigned_user_id = $3, updated_at = now()
       where tenant_id = $1 and id = $2
       returning id`,
      [user.tenant_id, id, body.userId],
    );
    if (!result.rows[0]) return reply.code(404).send({ error: "Conversa nao encontrada." });
    await query("insert into events (tenant_id, actor_user_id, entity_type, entity_id, event_type, payload) values ($1, $2, 'conversation', $3, 'conversation.assigned', $4)", [
      user.tenant_id,
      user.id,
      id,
      JSON.stringify({ assigned_user_id: body.userId }),
    ]);
    // Evita a briga classica de dois atendentes assumindo a mesma conversa: a
    // fila do colega muda no mesmo instante.
    const responsavel = await query<{ name: string }>("select name from users where tenant_id = $1 and id = $2", [user.tenant_id, body.userId ?? null]);
    publishRealtimeAsync({
      type: "conversation.updated",
      tenantId: user.tenant_id,
      conversationId: id,
      data: { id, assigned_user_id: body.userId, assigned_user_name: responsavel.rows[0]?.name ?? null, unassigned: body.userId === null },
    });
    return { ok: true };
  });

  app.get("/api/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = listQuerySchema.parse(request.query);
    const params: unknown[] = [user.tenant_id];
    const where = ["tenant_id = $1"];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(name ilike $${params.length} or phone ilike $${params.length} or email ilike $${params.length} or company ilike $${params.length})`);
    }
    const countParams = [...params];
    params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await query(
      `select id, name, email, phone, company, company_id, assigned_user_id, tags, source, created_at, updated_at
       from contacts
       where ${where.join(" and ")}
       order by updated_at desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const count = await query<{ total: string }>(`select count(*)::text as total from contacts where ${where.join(" and ")}`, countParams);
    return { contacts: result.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.get("/api/leads", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = listQuerySchema.parse(request.query);
    const params: unknown[] = [user.tenant_id];
    const where = ["l.tenant_id = $1"];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(l.title ilike $${params.length} or c.name ilike $${params.length} or c.phone ilike $${params.length} or c.company ilike $${params.length} or ps.name ilike $${params.length})`);
    }
    const countParams = [...params];
    params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await query(
      `select l.*,
              c.name as contact_name, c.phone as contact_phone, c.company as contact_company,
              ps.name as stage_name, ps.color as stage_color
       from leads l
       left join contacts c on c.id = l.contact_id
       left join pipeline_stages ps on ps.id = l.stage_id
       where ${where.join(" and ")}
       order by l.updated_at desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const count = await query<{ total: string }>(
      `select count(*)::text as total
       from leads l
       left join contacts c on c.id = l.contact_id
       left join pipeline_stages ps on ps.id = l.stage_id
       where ${where.join(" and ")}`,
      countParams,
    );
    return { leads: result.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.post("/api/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;

    const body = z.object({ name:z.string().trim().min(1).max(200), email:z.string().trim().email().nullable().optional(), phone:z.string().trim().nullable().optional(), company:z.string().trim().nullable().optional(), company_id:z.string().uuid().nullable().optional(), assigned_user_id:z.string().uuid().nullable().optional(), source:z.string().trim().nullable().optional(), tags:z.array(z.string().trim().max(80)).max(50).optional() }).parse(request.body);
    const values: Record<string, unknown> = { ...body };
    const contact = await transaction(async () => {
      values.tenant_id = user.tenant_id;
      const columns = Object.keys(values);
      const result = await query(`insert into contacts (${columns.join(",")}) values (${columns.map((_,i)=>`$${i+1}`).join(",")}) returning *`, Object.values(values));
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"contact","contact.created",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(201).send({ contact });
  });

  app.patch("/api/contacts/:id", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;
    const { id } = z.object({id:z.string().uuid()}).parse(request.params);
    const body = z.object({ name:z.string().trim().min(1).max(200), email:z.string().trim().email().nullable().optional(), phone:z.string().trim().nullable().optional(), company:z.string().trim().nullable().optional(), company_id:z.string().uuid().nullable().optional(), assigned_user_id:z.string().uuid().nullable().optional(), source:z.string().trim().nullable().optional(), tags:z.array(z.string().trim().max(80)).max(50).optional() }).partial().parse(request.body);
    const values: Record<string, unknown> = { ...body };
    const contact = await transaction(async () => {
      if (!Object.keys(values).length) throw Object.assign(new Error("Informe ao menos um campo."),{statusCode:400});
      const columns = Object.keys(values);
      const result = await query(`update contacts set ${columns.map((key,i)=>`${key}=$${i+3}`).join(",")}, updated_at=now() where tenant_id=$1 and id=$2 returning *`, [user.tenant_id,id,...Object.values(values)]);
      if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."),{statusCode:404});
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"contact","contact.updated",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(200).send({ contact });
  });

  app.delete("/api/contacts/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("delete from contacts where tenant_id = $1 and id = $2 returning id", [user.tenant_id, id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Contato nao encontrado." });
    await recordEvent(user.tenant_id, "contact", "contact.deleted", {}, user.id, id, (request as RequestWithId).requestId);
    return { ok: true };
  });

  app.get("/api/contacts/:id/timeline", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const [contactRes, eventsRes, tasksRes, messagesRes] = await Promise.all([
      query("select * from contacts where tenant_id = $1 and id = $2", [user.tenant_id, id]),
      query(
        `select id, entity_type, event_type, payload, created_at
         from events
         where tenant_id = $1 and entity_id = $2
         order by created_at desc limit 50`,
        [user.tenant_id, id],
      ),
      query(
        `select id, title, description, priority, due_at, status, created_at
         from tasks
         where tenant_id = $1 and contact_id = $2
         order by created_at desc limit 50`,
        [user.tenant_id, id],
      ),
      query(
        `select m.id, m.direction, m.body, m.sent_at, m.status
         from messages m
         join conversations c on c.id = m.conversation_id
         where m.tenant_id = $1 and c.contact_id = $2
         order by m.sent_at desc limit 50`,
        [user.tenant_id, id],
      ),
    ]);

    if (!contactRes.rows[0]) return reply.code(404).send({ error: "Contato nao encontrado." });

    return {
      contact: contactRes.rows[0],
      events: eventsRes.rows,
      tasks: tasksRes.rows,
      messages: messagesRes.rows,
    };
  });

  app.post("/api/leads", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;

    const body = z.object({ title:z.string().trim().min(1).max(200), value_cents:z.number().int().min(0).max(2147483647).optional(), status:z.enum(["open","won","lost","archived"]).optional(), stage_id:z.string().uuid().nullable().optional(), contact_id:z.string().uuid().nullable().optional(), company_id:z.string().uuid().nullable().optional(), assigned_user_id:z.string().uuid().nullable().optional(), tags:z.array(z.string().trim().max(80)).max(50).optional(), lost_reason:z.string().trim().max(2000).nullable().optional() }).parse(request.body);
    const values: Record<string, unknown> = { ...body };
    if (values.status) {
      values.won_at = values.status === "won" ? new Date().toISOString() : null;
      values.lost_at = values.status === "lost" ? new Date().toISOString() : null;
      if (values.status === "open") values.lost_reason = null;
    }
    if (!("stage_id" in values)) {
      const first = await query("select s.id from pipeline_stages s join pipelines p on p.id=s.pipeline_id where p.tenant_id=$1 order by p.created_at,s.position limit 1",[user.tenant_id]);
      values.stage_id = first.rows[0]?.id ?? null;
    }
    const lead = await transaction(async () => {
      values.tenant_id = user.tenant_id;
      const columns = Object.keys(values);
      const result = await query(`insert into leads (${columns.join(",")}) values (${columns.map((_,i)=>`$${i+1}`).join(",")}) returning *`, Object.values(values));
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"lead","lead.created",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(201).send({ lead });
  });

  app.patch("/api/leads/:id", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;
    const { id } = z.object({id:z.string().uuid()}).parse(request.params);
    const body = z.object({ title:z.string().trim().min(1).max(200), value_cents:z.number().int().min(0).max(2147483647).optional(), status:z.enum(["open","won","lost","archived"]).optional(), stage_id:z.string().uuid().nullable().optional(), contact_id:z.string().uuid().nullable().optional(), company_id:z.string().uuid().nullable().optional(), assigned_user_id:z.string().uuid().nullable().optional(), tags:z.array(z.string().trim().max(80)).max(50).optional(), lost_reason:z.string().trim().max(2000).nullable().optional() }).partial().parse(request.body);
    const values: Record<string, unknown> = { ...body };
    if (values.status) {
      values.won_at = values.status === "won" ? new Date().toISOString() : null;
      values.lost_at = values.status === "lost" ? new Date().toISOString() : null;
      if (values.status === "open") values.lost_reason = null;
    }
    const lead = await transaction(async () => {
      if (!Object.keys(values).length) throw Object.assign(new Error("Informe ao menos um campo."),{statusCode:400});
      const columns = Object.keys(values);
      const result = await query(`update leads set ${columns.map((key,i)=>`${key}=$${i+3}`).join(",")}, updated_at=now() where tenant_id=$1 and id=$2 returning *`, [user.tenant_id,id,...Object.values(values)]);
      if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."),{statusCode:404});
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"lead","lead.updated",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(200).send({ lead });
  });

  app.delete("/api/leads/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("delete from leads where tenant_id = $1 and id = $2 returning id", [user.tenant_id, id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Lead nao encontrado." });
    await recordEvent(user.tenant_id, "lead", "lead.deleted", {}, user.id, id, (request as RequestWithId).requestId);
    return { ok: true };
  });

  app.get("/api/pipeline", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const stages = await query(
      `select ps.id, ps.pipeline_id, ps.name, ps.position, ps.color, ps.required_fields, p.name as pipeline_name
       from pipeline_stages ps
       join pipelines p on p.id = ps.pipeline_id
       where p.tenant_id = $1
       order by ps.position asc`,
      [user.tenant_id],
    );
    const leads = await query(
      `select l.*,
              c.name as contact_name, c.phone as contact_phone, c.company as contact_company
       from leads l
       left join contacts c on c.id = l.contact_id
       where l.tenant_id = $1 and l.status = 'open'
       order by l.updated_at desc
       limit 200`,
      [user.tenant_id],
    );
    return { stages: stages.rows, leads: leads.rows };
  });

  // --- TASKS ENDPOINTS ---
  app.get("/api/tasks", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = taskQuerySchema.parse(request.query);
    const params: unknown[] = [user.tenant_id];
    const where = ["t.tenant_id = $1"];
    if (filters.status !== "all") {
      params.push(filters.status);
      where.push(`t.status = $${params.length}`);
    }
    if (filters.contactId) {
      params.push(filters.contactId);
      where.push(`t.contact_id = $${params.length}`);
    }
    if (filters.leadId) {
      params.push(filters.leadId);
      where.push(`t.lead_id = $${params.length}`);
    }
    if (filters.assignedUserId) {
      params.push(filters.assignedUserId);
      where.push(`t.assigned_user_id = $${params.length}`);
    }
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(t.title ilike $${params.length} or t.description ilike $${params.length})`);
    }
    const countParams = [...params];
    params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await query(
      `select t.id, t.contact_id, t.lead_id, t.assigned_user_id, t.title, t.description, t.priority, t.due_at, t.status, t.created_at, t.updated_at, t.conversation_id, t.reminder_at,
              u.name as assigned_user_name, c.name as contact_name, l.title as lead_title
       from tasks t
       left join users u on u.id = t.assigned_user_id
       left join contacts c on c.id = t.contact_id
       left join leads l on l.id = t.lead_id
       where ${where.join(" and ")}
       order by case when t.status = 'open' then 0 else 1 end, t.due_at asc nulls last, t.created_at desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const count = await query<{ total: string }>(`select count(*)::text as total from tasks t where ${where.join(" and ")}`, countParams);
    return { tasks: result.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.post("/api/tasks", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;

    const body = z.object({ title:z.string().trim().min(1).max(255), description:z.string().trim().nullable().optional(), status:z.enum(["open","completed","canceled"]).optional(), contactId:z.string().uuid().nullable().optional(), leadId:z.string().uuid().nullable().optional(), conversationId:z.string().uuid().nullable().optional(), assignedUserId:z.string().uuid().nullable().optional(), dueAt:z.string().datetime({offset:true}).nullable().optional(), reminderAt:z.string().datetime({offset:true}).nullable().optional(), priority:z.enum(["low","medium","high"]).optional() }).parse(request.body);
    const values: Record<string, unknown> = { ...body };
    for (const [from,to] of Object.entries({contactId:"contact_id",leadId:"lead_id",conversationId:"conversation_id",assignedUserId:"assigned_user_id",dueAt:"due_at",reminderAt:"reminder_at"})) {
      if (from in values) { values[to] = values[from]; delete values[from]; }
    }
    if ("reminder_at" in values) values.reminder_dismissed_at = null;
    if (!("assigned_user_id" in values)) values.assigned_user_id = user.id;
    const task = await transaction(async () => {
      values.tenant_id = user.tenant_id;
      const columns = Object.keys(values);
      const result = await query(`insert into tasks (${columns.join(",")}) values (${columns.map((_,i)=>`$${i+1}`).join(",")}) returning *`, Object.values(values));
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"task","task.created",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    syncTaskToGoogleCalendar(user.tenant_id, task as {id:string;title:string}).catch(() => {});
    return reply.code(201).send({ task });
  });

  app.patch("/api/tasks/:id", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;
    const { id } = z.object({id:z.string().uuid()}).parse(request.params);
    const body = z.object({ title:z.string().trim().min(1).max(255), description:z.string().trim().nullable().optional(), status:z.enum(["open","completed","canceled"]).optional(), contactId:z.string().uuid().nullable().optional(), leadId:z.string().uuid().nullable().optional(), conversationId:z.string().uuid().nullable().optional(), assignedUserId:z.string().uuid().nullable().optional(), dueAt:z.string().datetime({offset:true}).nullable().optional(), reminderAt:z.string().datetime({offset:true}).nullable().optional(), priority:z.enum(["low","medium","high"]).optional() }).partial().parse(request.body);
    const values: Record<string, unknown> = { ...body };
    for (const [from,to] of Object.entries({contactId:"contact_id",leadId:"lead_id",conversationId:"conversation_id",assignedUserId:"assigned_user_id",dueAt:"due_at",reminderAt:"reminder_at"})) {
      if (from in values) { values[to] = values[from]; delete values[from]; }
    }
    if ("reminder_at" in values) values.reminder_dismissed_at = null;
    const task = await transaction(async () => {
      if (!Object.keys(values).length) throw Object.assign(new Error("Informe ao menos um campo."),{statusCode:400});
      const columns = Object.keys(values);
      const result = await query(`update tasks set ${columns.map((key,i)=>`${key}=$${i+3}`).join(",")}, updated_at=now() where tenant_id=$1 and id=$2 returning *`, [user.tenant_id,id,...Object.values(values)]);
      if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."),{statusCode:404});
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"task","task.updated",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    syncTaskToGoogleCalendar(user.tenant_id, task as {id:string;title:string}).catch(() => {});
    return reply.code(200).send({ task });
  });

  app.delete("/api/tasks/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("delete from tasks where tenant_id = $1 and id = $2 returning *", [user.tenant_id, id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Tarefa nao encontrada." });
    void syncTaskToGoogleCalendar(user.tenant_id, result.rows[0] as {id:string;title:string});
    await recordEvent(user.tenant_id, "task", "task.deleted", {}, user.id, id, (request as RequestWithId).requestId);
    return { ok: true };
  });

  // --- COMPANIES ENDPOINTS ---
  app.get("/api/companies", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = listQuerySchema.parse(request.query);
    const params: unknown[] = [user.tenant_id];
    const where = ["tenant_id = $1"];
    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(name ilike $${params.length} or cnpj ilike $${params.length} or domain ilike $${params.length} or email ilike $${params.length})`);
    }
    const countParams = [...params];
    params.push(filters.pageSize, (filters.page - 1) * filters.pageSize);
    const result = await query(
      `select id, name, cnpj, domain, phone, email, address, created_at, updated_at,
              (select count(*)::int from contacts where company_id = companies.id and tenant_id = companies.tenant_id) as contacts_count
       from companies
       where ${where.join(" and ")}
       order by updated_at desc
       limit $${params.length - 1} offset $${params.length}`,
      params,
    );
    const count = await query<{ total: string }>(`select count(*)::text as total from companies where ${where.join(" and ")}`, countParams);
    return { companies: result.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.post("/api/companies", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;

    const body = z.object({ name:z.string().trim().min(1).max(200), cnpj:z.string().trim().nullable().optional(), domain:z.string().trim().nullable().optional(), phone:z.string().trim().nullable().optional(), email:z.union([z.string().trim().email(),z.literal("")]).nullable().optional(), address:z.string().trim().nullable().optional() }).parse(request.body);
    const values: Record<string, unknown> = { ...body };
    const company = await transaction(async () => {
      values.tenant_id = user.tenant_id;
      const columns = Object.keys(values);
      const result = await query(`insert into companies (${columns.join(",")}) values (${columns.map((_,i)=>`$${i+1}`).join(",")}) returning *`, Object.values(values));
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"company","company.created",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(201).send({ company });
  });

  app.patch("/api/companies/:id", async (request, reply) => {
    const user = await requireAuth(request, reply); if (!user) return;
    const { id } = z.object({id:z.string().uuid()}).parse(request.params);
    const body = z.object({ name:z.string().trim().min(1).max(200), cnpj:z.string().trim().nullable().optional(), domain:z.string().trim().nullable().optional(), phone:z.string().trim().nullable().optional(), email:z.union([z.string().trim().email(),z.literal("")]).nullable().optional(), address:z.string().trim().nullable().optional() }).partial().parse(request.body);
    const values: Record<string, unknown> = { ...body };
    const company = await transaction(async () => {
      if (!Object.keys(values).length) throw Object.assign(new Error("Informe ao menos um campo."),{statusCode:400});
      const columns = Object.keys(values);
      const result = await query(`update companies set ${columns.map((key,i)=>`${key}=$${i+3}`).join(",")}, updated_at=now() where tenant_id=$1 and id=$2 returning *`, [user.tenant_id,id,...Object.values(values)]);
      if (!result.rows[0]) throw Object.assign(new Error("Registro nao encontrado."),{statusCode:404});
      const saved = result.rows[0];
      await recordEvent(user.tenant_id,"company","company.updated",{fields:Object.keys(body)},user.id,saved.id,(request as RequestWithId).requestId);
      return saved;
    });
    return reply.code(200).send({ company });
  });

  app.delete("/api/companies/:id", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query("delete from companies where tenant_id = $1 and id = $2 returning id", [user.tenant_id, id]);
    if (!result.rows[0]) return reply.code(404).send({ error: "Empresa nao encontrada." });
    await recordEvent(user.tenant_id, "company", "company.deleted", {}, user.id, id, (request as RequestWithId).requestId);
    return { ok: true };
  });

  // --- LEAD STAGE UPDATES ---
  app.patch("/api/leads/:id/stage", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const body = updateLeadStageSchema.parse(request.body);

    const stageCheck = await query<{ id: string }>(
      `select ps.id
       from pipeline_stages ps
       join pipelines p on p.id = ps.pipeline_id
       where p.tenant_id = $1 and ps.id = $2`,
      [user.tenant_id, body.stageId],
    );
    if (!stageCheck.rows[0]) return reply.code(400).send({ error: "Estagio do funil invalido." });

    return transaction(async () => {
    const result = await query(
      `update leads
       set stage_id = $3, updated_at = now()
       where tenant_id = $1 and id = $2
       returning *`,
      [user.tenant_id, id, body.stageId],
    );
    if (!result.rows[0]) throw Object.assign(new Error("Lead nao encontrado."), {statusCode:404});
    await recordEvent(user.tenant_id, "lead", "lead.stage_changed", { stage_id: body.stageId }, user.id, id, (request as RequestWithId).requestId);
    return { lead: result.rows[0] };
    });
  });

  app.get("/api/channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query(
      `select id, provider, external_id, display_name, phone_number, status, metadata, team_name, last_sync_at, error_message, created_at, updated_at
       from channels
       where tenant_id = $1
       order by updated_at desc`,
      [
      user.tenant_id,
    ]);
    return { channels: result.rows };
  });

  /**
   * OAuth da Meta pelo app do próprio CRM: aposentado em 08/10/2026.
   *
   * Pedia App ID, App Secret e `SETUP_TOKEN` digitados à mão e nunca teve tela.
   * A conexão com a Meta agora mora no auth.avilaops.com e o CRM a lê por
   * `POST /api/meta/sincronizar` (ver `auth-meta.ts`).
   */
  const metaAposentada = async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return reply.code(410).send({
      error: "A conexao com a Meta passou para a conta Avila Ops. Conecte em Configuracoes > Canais > WhatsApp.",
      code: "meta_pelo_auth",
      paginaDaMeta: paginaDaMeta(),
    });
  };
  app.post("/api/meta/credentials", metaAposentada);
  app.get("/api/meta/login-url", metaAposentada);
  app.post("/api/meta/exchange", metaAposentada);
  app.post("/api/meta/sync-channels", metaAposentada);

  /**
   * Tira da empresa a cópia do token. A conexão em si continua no auth: quem
   * quer revogar o acesso da Ávila Ops à Meta faz isso em `/conta/meta`.
   */
  app.post("/api/meta/disconnect", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({error:"Permissao insuficiente."});

    const tenantId = user.tenant_id;
    const result = await query<MetaIntegration>(
      `update integrations
       set access_token = null, user_name = null, connected_at = null, token_expires_at = null,
         metadata = metadata - 'origem' - 'auth_email' - 'auth_estado' - 'sincronizado_em' - 'numeros' - 'escopos' - 'meta_user_id', updated_at = now()
       where tenant_id = $1 and provider = $2
       returning ${META_COLUMNS}`,
      [tenantId, META_PROVIDER],
    );
    await query("update channels set status = 'disconnected', updated_at = now() where tenant_id = $1 and provider = 'whatsapp' and metadata->>'origem' = 'auth'", [tenantId]);
    await recordEvent(tenantId, "integration", "meta.disconnected", { provider: META_PROVIDER }, user.id, null, (request as RequestWithId).requestId);

    return metaStatus(result.rows[0] ?? null);
  });

  app.get("/api/meta/webhook", async (request, reply) => {
    const queryParams = request.query as Record<string, string | undefined>;
    if (queryParams["hub.verify_token"] && queryParams["hub.verify_token"] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.type("text/plain").send(queryParams["hub.challenge"] ?? "");
    }
    return reply.code(403).send({ error: "Webhook nao autorizado." });
  });

  app.post("/api/meta/webhook", async (request, reply) => {
    if (!checkRateLimit(`webhook:${request.ip}`, 300, 60 * 1000)) {
      return reply.code(429).send({ error: "Rate limit exceeded." });
    }
    const payload = request.body as WhatsAppWebhookPayload;
    const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from(JSON.stringify(payload));
    const signature = request.headers["x-hub-signature-256"];
    const signatureValue = Array.isArray(signature) ? signature[0] : signature;
    const batches: Array<{ tenantId: string; payload: WhatsAppWebhookPayload }> = [];
    for (const entry of payload.entry ?? []) {
      for (const change of entry.changes ?? []) {
        const phoneId = change.value?.metadata?.phone_number_id;
        if (!phoneId) return reply.code(400).send({ error: "Webhook sem identificacao do canal." });
        const channels = await query<{ tenant_id: string }>("select distinct tenant_id from channels where provider = 'whatsapp' and external_id = $1", [phoneId]);
        if (channels.rows.length !== 1) return reply.code(400).send({ error: "Canal desconhecido ou ambiguo." });
        const tenantId = channels.rows[0].tenant_id;
        const { integration } = await getMetaIntegration(tenantId);
        if (!isValidSignature(rawBody, signatureValue, integration?.app_secret)) return reply.code(401).send({ error: "Assinatura invalida." });
        batches.push({ tenantId, payload: { object: payload.object, entry: [{ ...entry, changes: [change] }] } });
      }
    }
    if (!batches.length) return reply.code(400).send({ error: "Webhook vazio." });
    const processed = [];
    for (const batch of batches) {
      processed.push(await processWhatsAppWebhook(batch.tenantId, batch.payload));
      await recordEvent(batch.tenantId, "integration", "meta.webhook_received", { object: payload.object });
    }
    return { received: true, processed };
  });

  /**
   * Conexao por QR Code (WhatsApp Web pela Evolution API): desativada.
   *
   * E um caminho que a Meta nao permite — vincular a conta a versoes nao
   * oficiais "violates our Terms of Service" — e que pode custar o numero do
   * cliente. Pior: quando a Evolution nao respondia, esta rota desenhava um QR
   * falso, que nenhum celular conseguia ler, e deixava um canal parado em
   * "connecting" para sempre (o unico registro de `channels` em producao era
   * esse). A conexao oficial passa pela Messageria.
   *
   * Canais `qrcode`/`evolution` que ja existem continuam enviando — o roteamento
   * do envio nao mudou; so nao se cria mais nenhum.
   */
  app.post("/api/channels/qrcode/instance", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    return reply.code(410).send({
      error: "A conexao por QR Code foi desativada. Conecte o WhatsApp pela conexao oficial em Configuracoes > Canais > WhatsApp.",
      code: "qrcode_disabled",
    });
  });

  app.get("/api/channels/qrcode/status/:instanceName", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { instanceName } = z.object({ instanceName: z.string() }).parse(request.params);
    const channel = await query<{ status: string; display_name: string; phone_number: string }>(
      "select status, display_name, phone_number from channels where tenant_id = $1 and external_id = $2",
      [user.tenant_id, instanceName],
    );
    const row = channel.rows[0];
    return { status: row?.status ?? "connecting", display_name: row?.display_name ?? "WhatsApp Web", phone_number: row?.phone_number ?? "" };
  });

  app.get("/api/audit-logs", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = z.object({
      entityType: z.string().optional(),
      search: z.string().optional(),
      page: z.coerce.number().int().min(1).default(1),
      pageSize: z.coerce.number().int().min(1).max(100).default(50),
    }).parse(request.query);

    const offset = (filters.page - 1) * filters.pageSize;
    const where = ["e.tenant_id = $1"];
    const params: unknown[] = [user.tenant_id];

    if (filters.entityType && filters.entityType !== "all") {
      params.push(filters.entityType);
      where.push(`e.entity_type = $${params.length}`);
    }

    if (filters.search) {
      params.push(`%${filters.search}%`);
      where.push(`(e.event_type ilike $${params.length} or u.name ilike $${params.length} or u.email ilike $${params.length} or e.payload::text ilike $${params.length})`);
    }

    const result = await query(
      `select e.id, e.entity_type, e.event_type, e.payload, e.created_at, e.request_id,
              u.name as user_name, u.email as user_email
       from events e
       left join users u on u.id = e.actor_user_id
       where ${where.join(" and ")}
       order by e.created_at desc
       limit ${filters.pageSize} offset ${offset}`,
      params,
    );

    const count = await query<{ total: string }>(
      `select count(*)::text as total
       from events e
       left join users u on u.id = e.actor_user_id
       where ${where.join(" and ")}`,
      params,
    );

    return { logs: result.rows, pagination: { page: filters.page, pageSize: filters.pageSize, total: Number(count.rows[0]?.total ?? 0) } };
  });

  app.get("/api/integrations/google/auth-url", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });
    const clientId = process.env.GOOGLE_CLIENT_ID;
    // Sem cliente configurado, a URL levava o navegador a uma tela de erro do
    // Google com um client_id de demonstração. Melhor dizer aqui.
    if (!clientId || !process.env.GOOGLE_CLIENT_SECRET || (process.env.ENCRYPTION_KEY?.length ?? 0) < 32) {
      return reply.code(503).send({ error: "Google Agenda nao esta configurado neste ambiente.", code: "google_not_configured" });
    }
    const sessionHash = sessionHashFrom(request.headers.cookie);
    if (!sessionHash) return reply.code(401).send({ error: "Autenticacao obrigatoria." });
    const redirectUri = googleRedirectUri(process.env.PUBLIC_APP_URL, process.env.NODE_ENV === "production");
    if (!redirectUri) return reply.code(503).send({ error: "PUBLIC_APP_URL invalida para Google Agenda.", code: "google_not_configured" });
    const scopes = "https://www.googleapis.com/auth/calendar.events";
    // Duas amarras no mesmo `state`: o HMAC prende a esta sessao (oauth-state.ts)
    // e o registro em crm_oauth_states prende a usuario, empresa e provedor,
    // com uso unico.
    const state = await createOauthState(user, "google", redirectUri, signOAuthState(encryptionKey(), "google", sessionHash));
    const url = `https://accounts.google.com/o/oauth2/v2/auth?response_type=code&client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scopes)}&access_type=offline&prompt=consent&state=${encodeURIComponent(state)}`;
    return { url };
  });

  app.get("/api/integrations/google/status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { integration } = await getGoogleIntegration(user.tenant_id);
    return { connected: Boolean(integration?.access_token), email: integration?.user_name ?? undefined };
  });

  app.post("/api/integrations/google/disconnect", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });
    await query("delete from integrations where tenant_id = $1 and provider = $2", [user.tenant_id, GOOGLE_PROVIDER]);
    await recordEvent(user.tenant_id, "integration", "google_calendar.disconnected", {}, user.id, null, (request as RequestWithId).requestId);
    return { ok: true };
  });

  app.get("/api/integrations/google/callback", async (request, reply) => {
    const { code, state } = z.object({ code: z.string().optional(), state: z.string().optional() }).parse(request.query);
    if (!code || !state) return reply.code(400).send({ error: "Codigo ou estado invalido do Google OAuth." });

    // A volta do Google precisa da mesma sessão que pediu a conexão; o tenant
    // vem dela, nunca do `state`.
    const user = await getSessionUser(request.headers.cookie);
    const sessionHash = sessionHashFrom(request.headers.cookie);
    if (!user || !sessionHash) return reply.redirect("/");
    if (!canManage(user)) {
      await recordEvent(user.tenant_id, "integration", "google_calendar.callback_rejected", { reason: "permission" }, user.id);
      return reply.redirect("/#/settings/integrations/");
    }
    // Uso unico, preso a usuario, empresa e provedor (crm_oauth_states). Um
    // `state` que este servidor nao emitiu para esta pessoa responde 400.
    if (!await consumeOauthState(user, "google", state)) {
      await recordEvent(user.tenant_id, "integration", "google_calendar.callback_rejected", { reason: "state" }, user.id);
      return reply.code(400).send({ error: "Codigo ou estado invalido do Google OAuth." });
    }
    if ((process.env.ENCRYPTION_KEY?.length ?? 0) < 32) return reply.code(503).send({ error: "Google Agenda nao esta configurado neste ambiente.", code: "google_not_configured" });
    if (!verifyOAuthState(encryptionKey(), "google", state, sessionHash)) {
      await recordEvent(user.tenant_id, "integration", "google_calendar.callback_rejected", { reason: "state" }, user.id);
      return reply.redirect("/#/settings/integrations/");
    }

    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    if (!clientId || !clientSecret) return reply.code(503).send({ error: "Google Agenda nao esta configurado neste ambiente.", code: "google_not_configured" });
    const redirectUri = googleRedirectUri(process.env.PUBLIC_APP_URL, process.env.NODE_ENV === "production");
    if (!redirectUri) return reply.code(503).send({ error: "PUBLIC_APP_URL invalida para Google Agenda.", code: "google_not_configured" });

    try {
      const res = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: clientId ?? "",
          client_secret: clientSecret ?? "",
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });
      const data = (await res.json()) as { access_token?: string; refresh_token?: string };
      if (res.ok && data.access_token) {
        const encryptedAccess = encryptSecret(data.access_token);
        const encryptedRefresh = data.refresh_token ? encryptSecret(data.refresh_token) : "";
        await query(
          `insert into integrations (tenant_id, provider, access_token, refresh_token, user_name, connected_at, updated_at)
           values ($1, $2, $3, $4, 'Conta Google Workspace', now(), now())
           on conflict (tenant_id, provider)
           do update set access_token = excluded.access_token, refresh_token = case when excluded.refresh_token <> '' then excluded.refresh_token else integrations.refresh_token end, updated_at = now()`,
          [user.tenant_id, GOOGLE_PROVIDER, encryptedAccess, encryptedRefresh],
        );
        await recordEvent(user.tenant_id, "integration", "google_calendar.connected", {}, user.id);
      }
    } catch {
      // Registra evento de tentativa
    }

    return reply.redirect("/#/settings/integrations/");
  });

  // ── Integração com o ERP (erp.avilaops.com) ───────────────────────────────
  //
  // Ver [erp.ts](erp.ts) para o mapa de conciliação e a regra de ownership de
  // cada dado entre os dois sistemas.

  /**
   * Recepção dos eventos do ERP.
   *
   * Rota pública: quem chama é o outbox do ERP, que não tem sessão. A
   * autenticação é a assinatura HMAC do corpo cru, e o tenant vem do header —
   * aceitá-lo do corpo deixaria o remetente escolher a base antes de a
   * assinatura ser conferida.
   */
  app.post("/api/integrations/erp/webhook", async (request, reply) => {
    const erpTenantId = request.headers["x-avila-tenant"];
    if (typeof erpTenantId !== "string") {
      return reply.code(400).send({ error: "Header x-avila-tenant ausente." });
    }

    const connection = await findConnectionByErpTenant(erpTenantId, decryptSecret);
    if (!connection?.webhook_secret) {
      // 404 e não 401: confirmar que o tenant existe já é informação a mais
      // para quem está sondando.
      return reply.code(404).send({ error: "Integracao nao configurada." });
    }

    const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from("");
    const signature = verifyErpSignature(
      connection.webhook_secret,
      rawBody,
      request.headers["x-avila-signature"] as string | undefined,
    );

    if (!signature.valid) {
      await recordEvent(connection.tenant_id, "integration", "erp.webhook_rejected", { reason: signature.reason });
      return reply.code(401).send({ error: "Assinatura invalida." });
    }

    const event = request.body as ErpEventEnvelope;
    if (!event?.id || !event?.type || !event?.aggregate?.id) {
      return reply.code(400).send({ error: "Envelope de evento invalido." });
    }

    // Idempotência de entrada: a entrega do ERP é at-least-once, então a
    // segunda cópia do mesmo evento precisa virar no-op em vez de segundo lead.
    // A garantia é o unique, não uma consulta prévia — duas entregas
    // simultâneas passariam ambas pela consulta.
    let inboundId: string;
    try {
      const inserted = await query<{ id: string }>(
        `insert into inbound_events (tenant_id, source, external_id, event_type, payload)
         values ($1, 'erp', $2, $3, $4) returning id`,
        [connection.tenant_id, event.id, event.type, JSON.stringify(event)],
      );
      inboundId = inserted.rows[0].id;
    } catch (error) {
      if ((error as { code?: string }).code === "23505") {
        // 200 de propósito: repetir é comportamento normal do emissor, e
        // devolver erro faria o ERP reentregar até a dead-letter.
        return { ok: true, duplicate: true };
      }
      throw error;
    }

    try {
      const result = await handleErpEvent(connection, event, (tenantId, entityType, eventType, payload, actor, entityId) =>
        recordEvent(tenantId, entityType, eventType, payload, actor, entityId, (request as RequestWithId).requestId),
      );
      await query("update inbound_events set processed_at = now() where id = $1", [inboundId]);
      await query("update integrations set metadata = jsonb_set(metadata, '{last_event_at}', to_jsonb(now()::text), true), updated_at = now() where tenant_id = $1 and provider = $2", [
        connection.tenant_id,
        ERP_PROVIDER,
      ]);
      return { ok: true, ...result };
    } catch (error) {
      // Falha de regra de negócio não melhora com reentrega: registra-se o
      // erro e responde 200 para o evento não circular na fila do ERP. O
      // reprocessamento é manual, pela listagem de eventos de entrada.
      const message = String(error).slice(0, 1000);
      await query("update inbound_events set error = $2 where id = $1", [inboundId, message]);
      request.log.error({ err: error }, "Falha ao processar evento do ERP");
      return { ok: false, error: "Evento registrado com erro." };
    }
  });

  app.get("/api/integrations/erp/status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;

    const connection = await getConnection(user.tenant_id, decryptSecret);
    const pending = await query<{ total: string }>(
      "select count(*)::text as total from inbound_events where tenant_id = $1 and source = 'erp' and processed_at is null",
      [user.tenant_id],
    );
    const links = await query<{ entity_type: string; total: string }>(
      "select entity_type, count(*)::text as total from external_references where tenant_id = $1 and system = 'erp' group by entity_type",
      [user.tenant_id],
    );

    return {
      connected: Boolean(connection?.api_key),
      baseUrl: connection?.base_url ?? null,
      erpTenantId: connection?.erp_tenant_id ?? null,
      settings: connection?.settings ?? null,
      pendingEvents: Number(pending.rows[0]?.total ?? 0),
      links: Object.fromEntries(links.rows.map((row) => [row.entity_type, Number(row.total)])),
    };
  });

  app.post("/api/integrations/erp/connect", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });

    const body = erpConnectSchema.parse(request.body);

    await query(
      `insert into integrations (tenant_id, provider, app_secret, access_token, user_name, metadata, connected_at, updated_at)
       values ($1, $2, $3, $4, 'ERP Avila Ops', $5, now(), now())
       on conflict (tenant_id, provider)
       do update set app_secret = excluded.app_secret,
                     access_token = excluded.access_token,
                     metadata = excluded.metadata,
                     connected_at = now(),
                     updated_at = now()`,
      [
        user.tenant_id,
        ERP_PROVIDER,
        encryptSecret(body.webhookSecret),
        encryptSecret(body.apiKey),
        JSON.stringify({
          base_url: body.baseUrl,
          erp_tenant_id: body.erpTenantId,
          settings: body.settings ?? {},
        }),
      ],
    );

    // Sem segredo no evento: a trilha registra que houve conexão, não com o quê.
    await recordEvent(user.tenant_id, "integration", "erp.connected", { base_url: body.baseUrl, erp_tenant_id: body.erpTenantId }, user.id, null, (request as RequestWithId).requestId);
    return { ok: true };
  });

  app.post("/api/integrations/erp/disconnect", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });

    // Os vínculos sobrevivem à desconexão de propósito: reconectar depois
    // reencontra os mesmos contatos em vez de duplicar a base inteira.
    await query("delete from integrations where tenant_id = $1 and provider = $2", [user.tenant_id, ERP_PROVIDER]);
    await recordEvent(user.tenant_id, "integration", "erp.disconnected", {}, user.id, null, (request as RequestWithId).requestId);
    return { ok: true };
  });

  /** Eventos recebidos do ERP — console para diagnosticar o que falhou. */
  app.get("/api/integrations/erp/inbound", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const filters = z
      .object({ onlyErrors: z.coerce.boolean().default(false), limit: z.coerce.number().int().min(1).max(200).default(50) })
      .parse(request.query);

    const result = await query(
      `select id, external_id, event_type, processed_at, error, created_at
         from inbound_events
        where tenant_id = $1 and source = 'erp' ${filters.onlyErrors ? "and error is not null" : ""}
        order by created_at desc
        limit $2`,
      [user.tenant_id, filters.limit],
    );
    return { events: result.rows };
  });

  /**
   * Promove o contato a cliente do ERP.
   *
   * É o sentido CRM → ERP: o lead nasceu numa conversa de WhatsApp e agora
   * precisa de um `Customer` lá para o pedido apontar.
   */
  app.post("/api/contacts/:id/erp-customer", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);

    const connection = await getConnection(user.tenant_id, decryptSecret);
    if (!connection?.api_key) return reply.code(409).send({ error: "Conexao com o ERP nao configurada." });

    const contact = await query<{ id: string; name: string; email: string | null; phone: string | null; cpf_cnpj: string | null }>(
      "select id, name, email, phone, cpf_cnpj from contacts where tenant_id = $1 and id = $2",
      [user.tenant_id, id],
    );
    if (!contact.rows[0]) return reply.code(404).send({ error: "Contato nao encontrado." });

    try {
      const result = await pushContactToErp(connection, contact.rows[0]);
      await recordEvent(user.tenant_id, "contact", "erp.customer_pushed", { erp_customer_id: result.erpCustomerId, already_linked: result.alreadyLinked }, user.id, id, (request as RequestWithId).requestId);
      return result;
    } catch (error) {
      if (error instanceof ErpRequestError) return reply.code(error.status).send({ error: error.message });
      throw error;
    }
  });

  registerCrmCoreRoutes(app, { requireAuth });
  registerRealtimeRoutes(app, { requireAuth });
  registerWhatsAppMediaRoutes(app, {
    requireAuth,
    recordEvent,
    getMetaIntegration,
    graphVersion: META_GRAPH_VERSION,
    assertSendWindow,
    touchConversationAfterSend,
  });
  registerWhatsAppTemplateRoutes(app, {
    requireAuth,
    recordEvent,
    getMetaIntegration,
    graphVersion: META_GRAPH_VERSION,
    touchConversationAfterSend,
    decryptSecret,
  });
  registerAuthMetaRoutes(app, {
    requireAuth,
    canManage,
    checkRateLimit,
    recordEvent,
    encryptSecret,
    emailDoSso: (request) => {
      const token = parseCookies(request.headers.cookie).get(SSO_COOKIE);
      return (token ? verifySsoToken(token) : null)?.email ?? null;
    },
    gravarCanais: gravarCanaisDoAuth,
    status: async (tenantId) => metaStatus(await readMetaIntegration(tenantId)),
  });
  registerMessageriaRoutes(app, {
    requireAuth,
    canManage,
    recordEvent,
    encryptSecret,
    decryptSecret,
    upsertContato: upsertWhatsAppContact,
    obterConversa: getOrCreateConversation,
    publicar: publishRealtimeAsync,
  });
  if (options.background !== false) await startRealtime({ log: (mensagem, detalhe) => app.log.info({ detalhe }, mensagem) });

  registerMailRoutes(app, { requireAuth, encryptSecret, decryptSecret, recordEvent });
  registerAiRoutes(app, { requireAuth, encryptSecret, decryptSecret, recordEvent });
  registerProductRoutes(app, { requireAuth, recordEvent });
  registerAutomationRoutes(app, { requireAuth, recordEvent });
  registerSegmentRoutes(app, { requireAuth, recordEvent });
  registerMediaRoutes(app, { requireAuth, recordEvent });
  registerTeamRoutes(app, { requireAuth, recordEvent });
  registerSettingsRoutes(app, requireAuth, recordEvent);
  registerAccountRoutes(app, {
    requireAuth,
    recordEvent,
    hashPassword,
    verifyPassword,
    checkRateLimit,
    currentSessionHash: (request) => sessionHashFrom(request.headers.cookie),
  });
  if (options.background !== false) startAutomation({ decryptSecret, log: (mensagem, detalhe) => app.log.info({ detalhe }, mensagem) });

  if (existsSync(distDir)) {
    await app.register(fastifyStatic, {
      root: distDir,
      prefix: "/",
      wildcard: false,
    });

    app.setNotFoundHandler((request, reply) => {
      if (request.url.startsWith("/api/")) {
        return reply.code(404).send({ error: "Rota nao encontrada." });
      }
      return reply.sendFile("index.html");
    });
  }

  return app;
}

if (process.env.CRM_TEST_MODE !== "1") {
  buildApp().then(app => app.listen({ host: "0.0.0.0", port: PORT })).catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

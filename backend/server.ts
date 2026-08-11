import { config } from "dotenv";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, randomUUID, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { z } from "zod";
import { query } from "./db.js";

config({ path: ".env.local" });
config({ path: ".env" });

const META_GRAPH_VERSION = "v23.0";
const META_PROVIDER = "meta";
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "avila-ops";
const PORT = Number(process.env.PORT ?? 3000);
const SESSION_COOKIE = "agenda_session";
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
};

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
     join users u on u.id = s.user_id
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
    reply.code(401).send({ error: "Autenticacao obrigatoria." });
    return null;
  }
  return user;
}

function requireSetupToken(requestToken?: string) {
  const expected = process.env.SETUP_TOKEN;
  return Boolean(expected && requestToken && requestToken === expected);
}

async function getTenantId() {
  const result = await query<{ id: string }>("select id from tenants where slug = $1", [DEFAULT_TENANT_SLUG]);
  if (!result.rows[0]) throw new Error(`Tenant not found: ${DEFAULT_TENANT_SLUG}`);
  return result.rows[0].id;
}

async function getMetaIntegration() {
  const tenantId = await getTenantId();
  const result = await query<MetaIntegration>("select app_id, app_secret, access_token, user_name, connected_at, token_expires_at from integrations where tenant_id = $1 and provider = $2", [
    tenantId,
    META_PROVIDER,
  ]);
  const integration = result.rows[0] ?? null;
  if (integration) {
    integration.app_secret = decryptSecret(integration.app_secret);
    integration.access_token = decryptSecret(integration.access_token);
  }
  return { tenantId, integration };
}

function metaStatus(row: Awaited<ReturnType<typeof getMetaIntegration>>["integration"]) {
  return {
    configured: Boolean(row?.app_id && row?.app_secret),
    connected: Boolean(row?.access_token),
    appConfiguredHint: row?.app_id ? `***${row.app_id.slice(-4)}` : null,
    userName: row?.user_name ?? null,
    connectedAt: row?.connected_at ?? null,
    tokenExpiresAt: row?.token_expires_at ?? null,
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
     do update set display_name = excluded.display_name, phone_number = excluded.phone_number, status = 'connected', metadata = channels.metadata || excluded.metadata, updated_at = now()
     returning id`,
    [tenantId, externalId, displayName, metadata?.display_phone_number ?? null, JSON.stringify({ waba_id: entryId ?? null })],
  );
  return result.rows[0]?.id ?? null;
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
        const inserted = await query<{ id: string }>(
          `insert into messages (tenant_id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, metadata, sent_at)
           values ($1, $2, $3, 'inbound', $4, $5, $6, $7, $8, $9)
           on conflict (tenant_id, external_id) do nothing
           returning id`,
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
        if ((inserted.rowCount ?? 0) > 0) messages += 1;
        await query(
          `update conversations
           set status = 'waiting', last_message_at = greatest(coalesce(last_message_at, $2::timestamptz), $2::timestamptz),
               last_customer_message_at = greatest(coalesce(last_customer_message_at, $2::timestamptz), $2::timestamptz),
               updated_at = now()
           where id = $1`,
          [conversationId, sentAt],
        );
      }

      for (const status of value?.statuses ?? []) {
        statuses += 1;
        await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
          tenantId,
          "message",
          "meta.message_status",
          JSON.stringify(status),
        ]);
      }
    }
  }

  return { messages, statuses };
}

const credentialsSchema = z.object({
  appId: z.string().min(5),
  appSecret: z.string().optional(),
});

const exchangeSchema = z.object({
  code: z.string().min(1),
  state: z.string().min(16),
  redirectUri: z.string().url(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

const assignSchema = z.object({
  userId: z.string().uuid().nullable(),
});

function canManage(user: AuthUser) {
  return user.role === "admin" || user.role === "gerente" || user.role === "manager";
}

async function main() {
  const app = Fastify({ logger: true });
  await ensureInitialAdminPassword();

  app.addContentTypeParser("application/json", { parseAs: "buffer" }, (request, body, done) => {
    const rawBody = Buffer.isBuffer(body) ? body : Buffer.from(String(body));
    (request as RawBodyRequest).rawBody = rawBody;
    try {
      done(null, rawBody.length ? JSON.parse(rawBody.toString("utf8")) : {});
    } catch (error) {
      done(error as Error);
    }
  });

  app.addHook("onSend", async (request, reply, payload) => {
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
    return { ok: true, database: "connected" };
  });

  app.get("/api/auth/session", async (request) => {
    const user = await getSessionUser(request.headers.cookie);
    return { authenticated: Boolean(user), user };
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
       where lower(u.email) = lower($1) and t.slug = $2`,
      [body.email, DEFAULT_TENANT_SLUG],
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

    reply.header(
      "Set-Cookie",
      `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_DAYS * 24 * 60 * 60}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`,
    );
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
    const [tenant, users, contacts, channels, conversations, messages, leads] = await Promise.all([
      query("select id, name, slug, created_at from tenants where id = $1", [tenantId]),
      query("select id, name, email, role, created_at from users where tenant_id = $1 order by created_at", [tenantId]),
      query("select id, name, email, phone, company, source, created_at from contacts where tenant_id = $1 order by created_at desc limit 50", [tenantId]),
      query("select id, provider, external_id, display_name, phone_number, status, metadata, created_at from channels where tenant_id = $1 order by created_at desc", [tenantId]),
      query("select id, channel_id, contact_id, assigned_user_id, status, archived_at, last_message_at, last_customer_message_at, last_agent_message_at, created_at from conversations where tenant_id = $1 order by coalesce(last_message_at, created_at) desc limit 50", [tenantId]),
      query("select id, conversation_id, direction, sender_name, sender_phone, body, message_type, sent_at from messages where tenant_id = $1 order by sent_at desc limit 100", [tenantId]),
      query("select id, title, value_cents, status, stage_id, contact_id, created_at from leads where tenant_id = $1 order by created_at desc limit 100", [tenantId]),
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
    };
  });

  app.get("/api/meta/status", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { integration } = await getMetaIntegration();
    return metaStatus(integration);
  });

  app.get("/api/conversations", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query(
      `select c.id, c.channel_id, c.contact_id, c.assigned_user_id, c.status, c.archived_at,
              c.last_message_at, c.last_customer_message_at, c.last_agent_message_at, c.created_at,
              ct.name as contact_name, ct.phone as contact_phone, ct.email as contact_email, ct.company as contact_company,
              ch.display_name as channel_name, ch.phone_number as channel_phone, ch.status as channel_status,
              u.name as assigned_user_name,
              case
                when c.status <> 'archived' and c.last_customer_message_at is not null and (c.last_agent_message_at is null or c.last_customer_message_at > c.last_agent_message_at)
                then extract(epoch from (now() - c.last_customer_message_at))::int
                else 0
              end as waiting_seconds,
              (c.assigned_user_id is null and c.status <> 'archived') as unassigned
       from conversations c
       left join contacts ct on ct.id = c.contact_id
       left join channels ch on ch.id = c.channel_id
       left join users u on u.id = c.assigned_user_id
       where c.tenant_id = $1
       order by coalesce(c.last_message_at, c.created_at) desc
       limit 100`,
      [user.tenant_id],
    );
    return { conversations: result.rows };
  });

  app.get("/api/conversations/:id/messages", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const { id } = z.object({ id: z.string().uuid() }).parse(request.params);
    const result = await query(
      `select id, conversation_id, external_id, direction, sender_name, sender_phone, body, message_type, sent_at, created_at
       from messages
       where tenant_id = $1 and conversation_id = $2
       order by sent_at asc, created_at asc`,
      [user.tenant_id, id],
    );
    return { messages: result.rows };
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
    return { ok: true };
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
    return { ok: true };
  });

  app.get("/api/contacts", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query("select id, name, email, phone, company, source, created_at, updated_at from contacts where tenant_id = $1 order by updated_at desc limit 500", [
      user.tenant_id,
    ]);
    return { contacts: result.rows };
  });

  app.get("/api/leads", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query("select id, title, value_cents, status, stage_id, contact_id, created_at, updated_at from leads where tenant_id = $1 order by updated_at desc limit 500", [
      user.tenant_id,
    ]);
    return { leads: result.rows };
  });

  app.get("/api/channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const result = await query("select id, provider, external_id, display_name, phone_number, status, metadata, created_at, updated_at from channels where tenant_id = $1 order by updated_at desc", [
      user.tenant_id,
    ]);
    return { channels: result.rows };
  });

  app.post("/api/meta/credentials", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!requireSetupToken(request.headers["x-setup-token"] as string | undefined)) {
      return reply.code(401).send({ error: "Token administrativo invalido." });
    }

    const body = credentialsSchema.parse(request.body);
    const tenantId = await getTenantId();
    const current = await getMetaIntegration();
    const secretToSave = body.appSecret?.trim() ? encryptSecret(body.appSecret.trim()) : current.integration?.app_secret ? encryptSecret(current.integration.app_secret) : null;
    if (!secretToSave) return reply.code(400).send({ error: "App Secret obrigatorio na primeira configuracao." });
    const result = await query<MetaIntegration>(
      `insert into integrations (tenant_id, provider, app_id, app_secret, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (tenant_id, provider)
       do update set app_id = excluded.app_id, app_secret = excluded.app_secret, updated_at = now()
       returning app_id, app_secret, access_token, user_name, connected_at, token_expires_at`,
      [tenantId, META_PROVIDER, body.appId, secretToSave],
    );

    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.credentials_saved",
      JSON.stringify({ provider: META_PROVIDER }),
    ]);

    return metaStatus(result.rows[0]);
  });

  app.get("/api/meta/login-url", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const redirectUri = z.string().url().parse((request.query as { redirectUri?: string }).redirectUri);
    const { integration } = await getMetaIntegration();
    if (!integration?.app_id || !integration?.app_secret) {
      return reply.code(400).send({ error: "Credenciais Meta ainda nao configuradas." });
    }

    const state = randomUUID();
    const tenantId = await getTenantId();
    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.oauth_started",
      JSON.stringify({ state, redirectUri }),
    ]);

    const scopes = [
      "business_management",
      "pages_show_list",
      "pages_read_engagement",
      "instagram_basic",
      "ads_read",
      "leads_retrieval",
      "whatsapp_business_management",
      "whatsapp_business_messaging",
    ].join(",");

    const params = new URLSearchParams({
      client_id: integration.app_id,
      redirect_uri: redirectUri,
      state,
      scope: scopes,
      response_type: "code",
    });

    return { url: `https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth?${params.toString()}` };
  });

  app.post("/api/meta/exchange", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    const body = exchangeSchema.parse(request.body);
    const { tenantId, integration } = await getMetaIntegration();
    if (!integration?.app_id || !integration?.app_secret) {
      return reply.code(400).send({ error: "Credenciais Meta ainda nao configuradas." });
    }

    const shortUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    shortUrl.searchParams.set("client_id", integration.app_id);
    shortUrl.searchParams.set("client_secret", integration.app_secret);
    shortUrl.searchParams.set("redirect_uri", body.redirectUri);
    shortUrl.searchParams.set("code", body.code);
    const shortResponse = await fetch(shortUrl);
    const shortData = (await shortResponse.json()) as { access_token?: string; error?: { message?: string } };
    if (!shortResponse.ok || !shortData.access_token) {
      return reply.code(400).send({ error: shortData.error?.message ?? "Falha ao trocar codigo OAuth." });
    }

    const longUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token`);
    longUrl.searchParams.set("grant_type", "fb_exchange_token");
    longUrl.searchParams.set("client_id", integration.app_id);
    longUrl.searchParams.set("client_secret", integration.app_secret);
    longUrl.searchParams.set("fb_exchange_token", shortData.access_token);
    const longResponse = await fetch(longUrl);
    const longData = (await longResponse.json()) as { access_token?: string; expires_in?: number; error?: { message?: string } };
    if (!longResponse.ok || !longData.access_token) {
      return reply.code(400).send({ error: longData.error?.message ?? "Falha ao criar token Meta de longa duracao." });
    }

    const meUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me`);
    meUrl.searchParams.set("fields", "id,name");
    meUrl.searchParams.set("access_token", longData.access_token);
    const meResponse = await fetch(meUrl);
    const meData = (await meResponse.json()) as { id?: string; name?: string };
    const expiresAt = longData.expires_in ? new Date(Date.now() + longData.expires_in * 1000).toISOString() : null;

    const saved = await query<MetaIntegration>(
      `update integrations
       set access_token = $1, user_name = $2, connected_at = now(), token_expires_at = $3, metadata = metadata || $4::jsonb, updated_at = now()
       where tenant_id = $5 and provider = $6
       returning app_id, app_secret, access_token, user_name, connected_at, token_expires_at`,
      [encryptSecret(longData.access_token), meData.name ?? null, expiresAt, JSON.stringify({ meta_user_id: meData.id ?? null }), tenantId, META_PROVIDER],
    );

    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.connected",
      JSON.stringify({ userName: meData.name ?? null }),
    ]);

    return metaStatus(saved.rows[0]);
  });

  app.post("/api/meta/disconnect", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!requireSetupToken(request.headers["x-setup-token"] as string | undefined)) {
      return reply.code(401).send({ error: "Token administrativo invalido." });
    }

    const tenantId = await getTenantId();
    const result = await query<MetaIntegration>(
      `update integrations
       set access_token = null, user_name = null, connected_at = null, token_expires_at = null, updated_at = now()
       where tenant_id = $1 and provider = $2
       returning app_id, app_secret, access_token, user_name, connected_at, token_expires_at`,
      [tenantId, META_PROVIDER],
    );

    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.disconnected",
      JSON.stringify({ provider: META_PROVIDER }),
    ]);

    return metaStatus(result.rows[0] ?? null);
  });

  app.post("/api/meta/sync-channels", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });
    const { integration } = await getMetaIntegration();
    if (!integration?.access_token) return reply.code(400).send({ error: "Meta ainda nao conectada." });

    const businessesUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/me/businesses`);
    businessesUrl.searchParams.set("fields", "id,name");
    businessesUrl.searchParams.set("access_token", integration.access_token);
    const businessesResponse = await fetch(businessesUrl);
    const businessesData = (await businessesResponse.json()) as { data?: Array<{ id: string; name?: string }>; error?: { message?: string } };
    if (!businessesResponse.ok) return reply.code(400).send({ error: businessesData.error?.message ?? "Falha ao listar negocios Meta." });

    const synced = [];
    for (const business of businessesData.data ?? []) {
      const wabaUrl = new URL(`https://graph.facebook.com/${META_GRAPH_VERSION}/${business.id}/owned_whatsapp_business_accounts`);
      wabaUrl.searchParams.set("fields", "id,name,phone_numbers{id,display_phone_number,verified_name,code_verification_status,quality_rating}");
      wabaUrl.searchParams.set("access_token", integration.access_token);
      const wabaResponse = await fetch(wabaUrl);
      const wabaData = (await wabaResponse.json()) as {
        data?: Array<{
          id: string;
          name?: string;
          phone_numbers?: { data?: Array<{ id: string; display_phone_number?: string; verified_name?: string; code_verification_status?: string; quality_rating?: string }> };
        }>;
      };
      if (!wabaResponse.ok) continue;
      for (const waba of wabaData.data ?? []) {
        for (const phone of waba.phone_numbers?.data ?? []) {
          const channelId = await upsertWhatsAppChannel(user.tenant_id, waba.id, { phone_number_id: phone.id, display_phone_number: phone.display_phone_number });
          await query("update channels set metadata = metadata || $1::jsonb, updated_at = now() where id = $2", [
            JSON.stringify({
              business_id: business.id,
              business_name: business.name ?? null,
              waba_name: waba.name ?? null,
              verified_name: phone.verified_name ?? null,
              code_verification_status: phone.code_verification_status ?? null,
              quality_rating: phone.quality_rating ?? null,
            }),
            channelId,
          ]);
          synced.push({ id: phone.id, displayPhoneNumber: phone.display_phone_number ?? null, verifiedName: phone.verified_name ?? null });
        }
      }
    }

    await query("insert into events (tenant_id, actor_user_id, entity_type, event_type, payload) values ($1, $2, 'channel', 'meta.channels_synced', $3)", [
      user.tenant_id,
      user.id,
      JSON.stringify({ count: synced.length }),
    ]);
    return { channels: synced };
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
    const tenantId = await getTenantId();
    const { integration } = await getMetaIntegration();
    const signature = request.headers["x-hub-signature-256"];
    const signatureValue = Array.isArray(signature) ? signature[0] : signature;
    const rawBody = (request as RawBodyRequest).rawBody ?? Buffer.from(JSON.stringify(request.body ?? {}));
    if (!isValidSignature(rawBody, signatureValue, integration?.app_secret)) {
      await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
        tenantId,
        "integration",
        "meta.webhook_invalid_signature",
        JSON.stringify({ has_signature: Boolean(signatureValue), ip: request.ip }),
      ]);
      return reply.code(401).send({ error: "Assinatura invalida." });
    }

    const processed = await processWhatsAppWebhook(tenantId, request.body as WhatsAppWebhookPayload);
    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.webhook_received",
      JSON.stringify({ object: (request.body as WhatsAppWebhookPayload | undefined)?.object ?? null, processed }),
    ]);
    return { received: true, processed };
  });

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

  await app.listen({ host: "0.0.0.0", port: PORT });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

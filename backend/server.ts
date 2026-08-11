import { config } from "dotenv";
import fastifyStatic from "@fastify/static";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { existsSync } from "node:fs";
import { createHash, randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
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
  return { tenantId, integration: result.rows[0] ?? null };
}

function metaStatus(row: Awaited<ReturnType<typeof getMetaIntegration>>["integration"]) {
  return {
    configured: Boolean(row?.app_id && row?.app_secret),
    connected: Boolean(row?.access_token),
    appId: row?.app_id ?? "",
    userName: row?.user_name ?? null,
    connectedAt: row?.connected_at ?? null,
    tokenExpiresAt: row?.token_expires_at ?? null,
  };
}

const credentialsSchema = z.object({
  appId: z.string().min(5),
  appSecret: z.string().min(8),
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

async function main() {
  const app = Fastify({ logger: true });
  await ensureInitialAdminPassword();

  app.get("/api/health", async () => {
    await query("select 1");
    return { ok: true, database: "connected" };
  });

  app.get("/api/auth/session", async (request) => {
    const user = await getSessionUser(request.headers.cookie);
    return { authenticated: Boolean(user), user };
  });

  app.post("/api/auth/login", async (request, reply) => {
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

  app.post("/api/meta/credentials", async (request, reply) => {
    const user = await requireAuth(request, reply);
    if (!user) return;
    if (!requireSetupToken(request.headers["x-setup-token"] as string | undefined)) {
      return reply.code(401).send({ error: "Token administrativo invalido." });
    }

    const body = credentialsSchema.parse(request.body);
    const tenantId = await getTenantId();
    const result = await query<MetaIntegration>(
      `insert into integrations (tenant_id, provider, app_id, app_secret, updated_at)
       values ($1, $2, $3, $4, now())
       on conflict (tenant_id, provider)
       do update set app_id = excluded.app_id, app_secret = excluded.app_secret, updated_at = now()
       returning app_id, app_secret, access_token, user_name, connected_at, token_expires_at`,
      [tenantId, META_PROVIDER, body.appId, body.appSecret],
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

    const state = crypto.randomUUID();
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
      [longData.access_token, meData.name ?? null, expiresAt, JSON.stringify({ meta_user_id: meData.id ?? null }), tenantId, META_PROVIDER],
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

  app.get("/api/meta/webhook", async (request, reply) => {
    const queryParams = request.query as Record<string, string | undefined>;
    if (queryParams["hub.verify_token"] && queryParams["hub.verify_token"] === process.env.META_WEBHOOK_VERIFY_TOKEN) {
      return reply.type("text/plain").send(queryParams["hub.challenge"] ?? "");
    }
    return reply.code(403).send({ error: "Webhook nao autorizado." });
  });

  app.post("/api/meta/webhook", async (request) => {
    const tenantId = await getTenantId();
    await query("insert into events (tenant_id, entity_type, event_type, payload) values ($1, $2, $3, $4)", [
      tenantId,
      "integration",
      "meta.webhook_received",
      JSON.stringify(request.body ?? {}),
    ]);
    return { received: true };
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

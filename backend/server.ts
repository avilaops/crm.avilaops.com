import { config } from "dotenv";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import { query } from "./db.js";

config({ path: ".env.local" });
config({ path: ".env" });

const META_GRAPH_VERSION = "v23.0";
const META_PROVIDER = "meta";
const DEFAULT_TENANT_SLUG = process.env.DEFAULT_TENANT_SLUG ?? "avila-ops";
const PORT = Number(process.env.PORT ?? 3000);

type MetaIntegration = {
  app_id: string | null;
  app_secret: string | null;
  access_token: string | null;
  user_name: string | null;
  connected_at: string | null;
  token_expires_at: string | null;
};

const here = dirname(fileURLToPath(import.meta.url));
const rootDir = join(here, "..");
const distDir = join(rootDir, "dist");

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

async function main() {
  const app = Fastify({ logger: true });

  app.get("/api/health", async () => {
    await query("select 1");
    return { ok: true, database: "connected" };
  });

  app.get("/api/bootstrap", async () => {
    const tenantId = await getTenantId();
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
      contacts: contacts.rows,
      channels: channels.rows,
      conversations: conversations.rows,
      messages: messages.rows,
      leads: leads.rows,
    };
  });

  app.get("/api/meta/status", async () => {
    const { integration } = await getMetaIntegration();
    return metaStatus(integration);
  });

  app.post("/api/meta/credentials", async (request, reply) => {
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

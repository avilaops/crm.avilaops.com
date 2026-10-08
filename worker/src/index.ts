export interface Env {
  META_KV: KVNamespace;
  ALLOWED_ORIGINS?: string;
  SETUP_TOKEN?: string;
}

const META_GRAPH_VERSION = "v23.0";
const META_SCOPES =
  "business_management,pages_show_list,pages_read_engagement,instagram_basic,ads_read,leads_retrieval,whatsapp_business_management,whatsapp_business_messaging";
const CREDENTIALS_KEY = "meta:credentials";
const CONNECTION_KEY = "meta:connection";
const STATE_TTL_SECONDS = 600;

type Credentials = { appId: string; appSecret: string };
type Connection = {
  accessToken: string;
  userName: string | null;
  connectedAt: string;
  tokenExpiresAt: string | null;
};
type Status = {
  configured: boolean;
  connected: boolean;
  appId: string;
  userName: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
};

function corsHeaders(origin: string | null, env: Env): Record<string, string> {
  const allowList = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const allowOrigin = allowList.length === 0 || (origin && allowList.includes(origin)) ? origin ?? "*" : allowList[0];

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type,X-Setup-Token",
    Vary: "Origin",
  };
}

function json(data: unknown, origin: string | null, env: Env, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...corsHeaders(origin, env),
    },
  });
}

async function getCredentials(env: Env): Promise<Credentials | null> {
  const raw = await env.META_KV.get(CREDENTIALS_KEY);
  return raw ? (JSON.parse(raw) as Credentials) : null;
}

async function getConnection(env: Env): Promise<Connection | null> {
  const raw = await env.META_KV.get(CONNECTION_KEY);
  return raw ? (JSON.parse(raw) as Connection) : null;
}

async function buildStatus(env: Env): Promise<Status> {
  const [credentials, connection] = await Promise.all([getCredentials(env), getConnection(env)]);
  return {
    configured: Boolean(credentials?.appId && credentials?.appSecret),
    connected: Boolean(connection?.accessToken),
    appId: credentials?.appId ?? "",
    userName: connection?.userName ?? null,
    connectedAt: connection?.connectedAt ?? null,
    tokenExpiresAt: connection?.tokenExpiresAt ?? null,
  };
}

function metaErrorMessage(value: unknown, fallback: string): string {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: { message?: unknown } }).error;
    if (error && typeof error.message === "string") return error.message;
  }
  return fallback;
}

function hasValidSetupToken(request: Request, env: Env): boolean {
  if (!env.SETUP_TOKEN) return false;
  const token = request.headers.get("X-Setup-Token") ?? "";
  return token.length > 0 && token === env.SETUP_TOKEN;
}

async function exchangeCode(appId: string, appSecret: string, code: string, redirectUri: string) {
  const shortResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?` +
      new URLSearchParams({ client_id: appId, client_secret: appSecret, redirect_uri: redirectUri, code }),
  );
  const short = (await shortResponse.json()) as { access_token?: string };
  if (!shortResponse.ok || !short.access_token) {
    throw new Error(metaErrorMessage(short, "Não foi possível trocar o código com a Meta."));
  }

  const longResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/oauth/access_token?` +
      new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: appId,
        client_secret: appSecret,
        fb_exchange_token: short.access_token,
      }),
  );
  const long = (await longResponse.json()) as { access_token?: string; expires_in?: number };
  const accessToken = long.access_token ?? short.access_token;

  const meResponse = await fetch(
    `https://graph.facebook.com/${META_GRAPH_VERSION}/me?` +
      new URLSearchParams({ access_token: accessToken, fields: "id,name" }),
  );
  const me = (await meResponse.json()) as { name?: string };

  return {
    accessToken,
    userName: typeof me.name === "string" ? me.name : null,
    tokenExpiresAt: long.expires_in ? new Date(Date.now() + long.expires_in * 1000).toISOString() : null,
  };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const origin = request.headers.get("Origin");

    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(origin, env) });
    }

    try {
      if (url.pathname === "/status" && request.method === "GET") {
        return json(await buildStatus(env), origin, env);
      }

      if (url.pathname === "/credentials" && request.method === "POST") {
        if (!hasValidSetupToken(request, env)) {
          return json({ error: "Token administrativo inválido." }, origin, env, 401);
        }

        const body = (await request.json()) as { appId?: string; appSecret?: string };
        const appId = (body.appId ?? "").trim();
        const appSecret = (body.appSecret ?? "").trim();
        if (!appId) return json({ error: "Informe o App ID." }, origin, env, 400);

        const existing = await getCredentials(env);
        const next: Credentials = { appId, appSecret: appSecret || existing?.appSecret || "" };
        await env.META_KV.put(CREDENTIALS_KEY, JSON.stringify(next));
        return json(await buildStatus(env), origin, env);
      }

      if (url.pathname === "/login-url" && request.method === "GET") {
        const redirectUri = url.searchParams.get("redirectUri");
        if (!redirectUri) return json({ error: "redirectUri é obrigatório." }, origin, env, 400);

        const credentials = await getCredentials(env);
        if (!credentials?.appId || !credentials.appSecret) {
          return json({ error: "Configure o App ID e o App Secret antes de conectar." }, origin, env, 400);
        }

        const state = crypto.randomUUID().replace(/-/g, "");
        await env.META_KV.put(`meta:state:${state}`, "1", { expirationTtl: STATE_TTL_SECONDS });

        const loginUrl = new URL(`https://www.facebook.com/${META_GRAPH_VERSION}/dialog/oauth`);
        loginUrl.searchParams.set("client_id", credentials.appId);
        loginUrl.searchParams.set("redirect_uri", redirectUri);
        loginUrl.searchParams.set("response_type", "code");
        loginUrl.searchParams.set("scope", META_SCOPES);
        loginUrl.searchParams.set("state", state);

        return json({ url: loginUrl.toString(), state }, origin, env);
      }

      if (url.pathname === "/exchange" && request.method === "POST") {
        const body = (await request.json()) as { code?: string; state?: string; redirectUri?: string };
        const { code, state, redirectUri } = body;
        if (!code || !state || !redirectUri) {
          return json({ error: "Parâmetros incompletos." }, origin, env, 400);
        }

        const stateKey = `meta:state:${state}`;
        const validState = await env.META_KV.get(stateKey);
        if (!validState) {
          return json({ error: "Login expirado ou inválido. Tente novamente." }, origin, env, 400);
        }
        await env.META_KV.delete(stateKey);

        const credentials = await getCredentials(env);
        if (!credentials?.appId || !credentials.appSecret) {
          return json({ error: "Configure o App ID e o App Secret antes de conectar." }, origin, env, 400);
        }

        const result = await exchangeCode(credentials.appId, credentials.appSecret, code, redirectUri);
        const connection: Connection = {
          accessToken: result.accessToken,
          userName: result.userName,
          connectedAt: new Date().toISOString(),
          tokenExpiresAt: result.tokenExpiresAt,
        };
        await env.META_KV.put(CONNECTION_KEY, JSON.stringify(connection));

        return json(await buildStatus(env), origin, env);
      }

      if (url.pathname === "/disconnect" && request.method === "POST") {
        if (!hasValidSetupToken(request, env)) {
          return json({ error: "Token administrativo inválido." }, origin, env, 401);
        }

        await env.META_KV.delete(CONNECTION_KEY);
        return json(await buildStatus(env), origin, env);
      }

      return json({ error: "Rota não encontrada." }, origin, env, 404);
    } catch (error) {
      return json({ error: error instanceof Error ? error.message : "Erro inesperado." }, origin, env, 500);
    }
  },
};

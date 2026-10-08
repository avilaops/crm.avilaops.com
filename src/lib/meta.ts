/**
 * Conta da Meta da empresa.
 *
 * A conexão mora na conta Ávila Ops (auth.avilaops.com): a pessoa conecta o
 * Facebook da empresa lá, uma vez, e o CRM traz a conexão com `sincronizarMeta`.
 * O OAuth que o CRM fazia por conta própria, com App ID e App Secret digitados,
 * foi aposentado em 08/10/2026.
 *
 * Este caminho descobre os números e deixa enviar. Receber mensagem continua
 * pela Messageria (ver docs/INTEGRACAO-MESSAGERIA.md).
 */
const BASE = "/api/meta";

export type MetaStatus = {
  configured: boolean;
  connected: boolean;
  appConfiguredHint: string | null;
  userName: string | null;
  connectedAt: string | null;
  tokenExpiresAt: string | null;
  /** `auth`: lida da conta Ávila Ops. `direta`: OAuth antigo do próprio CRM. */
  origem: "auth" | "direta" | null;
  /** E-mail da conta Ávila Ops de onde a conexão veio. */
  conta: string | null;
  /** A conta Ávila Ops avisou que a conexão caiu; a pessoa precisa refazê-la lá. */
  pendencia: "vencida" | "nao_conectada" | null;
  numeros: number | null;
  paginaDaMeta: string;
};

/** Antes de trocar a conta ligada à empresa, o servidor devolve só isto. */
export type MetaPrevia = { previa: true; conta: string; nome: string | null; numeros: string[] };
export type MetaSincronizada = MetaStatus & { previa: false; criados: number; atualizados: number };

/** Erro do servidor com o código, para a tela escolher o que oferecer. */
export class MetaError extends Error {
  code: string | null;

  constructor(message: string, code: string | null) {
    super(message);
    this.name = "MetaError";
    this.code = code;
  }
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    ...init,
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const data = (await response.json().catch(() => null)) as { error?: unknown; code?: unknown } | null;
  if (!response.ok) {
    throw new MetaError(typeof data?.error === "string" ? data.error : "Erro ao comunicar com o servidor.", typeof data?.code === "string" ? data.code : null);
  }
  return data as T;
}

export function getMetaStatus() {
  return fetchJson<MetaStatus>("/status");
}

/**
 * Traz a conexão da conta Ávila Ops de quem está logado. Sem `confirmar`, e se
 * a empresa ainda não usa essa conta, a resposta é só a prévia.
 */
export function sincronizarMeta(confirmar = false) {
  return fetchJson<MetaPrevia | MetaSincronizada>("/sincronizar", { method: "POST", body: JSON.stringify({ confirmar }) });
}

export function disconnectMeta() {
  return fetchJson<MetaStatus>("/disconnect", { method: "POST", body: "{}" });
}

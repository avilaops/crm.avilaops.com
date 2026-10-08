/**
 * A conexão com a Meta mora no auth.avilaops.com; o CRM só lê.
 *
 * O cliente conecta o Facebook da empresa uma vez, em `/conta/meta` do auth, e
 * cada sistema da casa busca a conexão por `GET /api/meta/ativos`. O CRM guarda
 * uma cópia cifrada do token em `integrations` para não ir ao auth a cada
 * mensagem, e a renova sozinho.
 *
 * O que este caminho entrega: a conta visível no CRM, token para enviar e os
 * números descobertos. O que ele não entrega: recebimento. O webhook direto da
 * Meta confere a assinatura com um `app_secret` por empresa, que o auth não
 * repassa; mensagem recebida continua chegando pela Messageria.
 */
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { query } from "./db.js";

const TIMEOUT_MS = 10_000;
const META_PROVIDER = "meta";
/** Com o token ainda válido, confere no auth no máximo a cada seis horas. */
const RENOVAR_APOS_MS = 6 * 60 * 60 * 1000;
/** Auth fora do ar não pode virar uma chamada por mensagem enviada. */
const ESPERA_ENTRE_TENTATIVAS_MS = 5 * 60 * 1000;

export type CodigoAuthMeta = "nao_conectada" | "vencida" | "nao_configurado" | "indisponivel";

const STATUS_POR_CODIGO: Record<CodigoAuthMeta, number> = {
  nao_conectada: 404,
  vencida: 409,
  nao_configurado: 503,
  indisponivel: 502,
};

export class AuthMetaError extends Error {
  status: number;
  codigo: CodigoAuthMeta;

  constructor(message: string, codigo: CodigoAuthMeta) {
    super(message);
    this.name = "AuthMetaError";
    this.codigo = codigo;
    this.status = STATUS_POR_CODIGO[codigo];
  }
}

export type AtivoMeta = {
  tipo: string;
  externoId: string;
  nome: string;
  detalhe: Record<string, unknown> | null;
  token: string | null;
};

export type ConexaoMetaDoAuth = {
  conta: { id: string; email: string };
  meta: { usuarioId: string; nome: string | null; escopos: string[]; expiraEm: string | null };
  token: string;
  ativos: AtivoMeta[];
};

export type CanalDescoberto = {
  numeroId: string;
  /** Como a Meta exibe o número; `null` quando o auth não soube casar o rótulo. */
  numero: string | null;
  wabaId: string;
  wabaNome: string | null;
  negocio: string | null;
};

function baseDoAuth() {
  return (process.env.SSO_BASE_URL ?? "https://auth.avilaops.com").replace(/\/$/, "");
}

/** Onde o cliente conecta, troca ou reconecta a conta da Meta. */
export function paginaDaMeta() {
  return `${baseDoAuth()}/conta/meta`;
}

/**
 * Busca no auth a conexão da Meta de uma conta.
 *
 * As variáveis são lidas aqui dentro, e não no topo do arquivo, porque o
 * `dotenv` do servidor roda depois dos imports.
 */
export async function buscarConexaoMeta(email: string): Promise<ConexaoMetaDoAuth> {
  const id = process.env.AUTH_META_CLIENT_ID;
  const segredo = process.env.AUTH_META_CLIENT_SECRET;
  if (!id || !segredo) {
    throw new AuthMetaError("Este ambiente nao esta ligado a conta Avila Ops para ler a Meta.", "nao_configurado");
  }

  let resposta: Response;
  try {
    resposta = await fetch(`${baseDoAuth()}/api/meta/ativos?email=${encodeURIComponent(email.trim().toLowerCase())}`, {
      headers: { authorization: `Basic ${Buffer.from(`${id}:${segredo}`).toString("base64")}`, accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new AuthMetaError("Nao foi possivel falar com a conta Avila Ops agora.", "indisponivel");
  }

  if (resposta.status === 404) throw new AuthMetaError("Esta conta ainda nao conectou a Meta.", "nao_conectada");
  if (resposta.status === 409) throw new AuthMetaError("A conexao com a Meta venceu. Conecte de novo.", "vencida");
  if (resposta.status === 401 || resposta.status === 403) {
    throw new AuthMetaError("O CRM nao tem permissao para ler a Meta na conta Avila Ops.", "nao_configurado");
  }
  if (!resposta.ok) throw new AuthMetaError(`A conta Avila Ops respondeu ${resposta.status}.`, "indisponivel");

  const dados = (await resposta.json().catch(() => null)) as Partial<ConexaoMetaDoAuth> | null;
  if (!dados || typeof dados.token !== "string" || !dados.token || !dados.conta?.email || !dados.meta) {
    throw new AuthMetaError("A conta Avila Ops devolveu uma resposta que o CRM nao entendeu.", "indisponivel");
  }
  return {
    conta: dados.conta,
    meta: {
      usuarioId: String(dados.meta.usuarioId ?? ""),
      nome: dados.meta.nome ?? null,
      escopos: Array.isArray(dados.meta.escopos) ? dados.meta.escopos : [],
      expiraEm: dados.meta.expiraEm ?? null,
    },
    token: dados.token,
    ativos: Array.isArray(dados.ativos) ? dados.ativos : [],
  };
}

function csv(valor: unknown) {
  return typeof valor === "string" ? valor.split(",").map((parte) => parte.trim()).filter(Boolean) : [];
}

/**
 * Um canal por número de WhatsApp.
 *
 * O auth entrega um ativo por conta do WhatsApp Business, com os ids e os
 * rótulos dos números em duas listas paralelas. Se elas não tiverem o mesmo
 * tamanho, o rótulo fica de fora: número com o telefone do vizinho é pior do
 * que número sem telefone.
 */
export function canaisDeAtivos(ativos: AtivoMeta[]): CanalDescoberto[] {
  const canais = new Map<string, CanalDescoberto>();
  for (const ativo of ativos) {
    if (ativo.tipo !== "whatsapp") continue;
    const ids = csv(ativo.detalhe?.numeroIds);
    const rotulos = csv(ativo.detalhe?.numeros);
    const casam = ids.length === rotulos.length;
    ids.forEach((numeroId, indice) => {
      const rotulo = casam ? rotulos[indice] : null;
      canais.set(numeroId, {
        numeroId,
        // Sem telefone de exibição o auth repete o id no lugar do rótulo.
        numero: rotulo && rotulo !== numeroId ? rotulo : null,
        wabaId: ativo.externoId,
        wabaNome: ativo.nome || null,
        negocio: typeof ativo.detalhe?.negocio === "string" ? ativo.detalhe.negocio : null,
      });
    });
  }
  return [...canais.values()];
}

type MetadadosDaConexao = Record<string, unknown> | null | undefined;

/**
 * Quando ir ao auth de novo.
 *
 * `agora`: o token guardado já venceu, não adianta devolvê-lo.
 * `segundo_plano`: o token ainda vale; devolve o que tem e confere depois.
 * `nao`: conexão que não veio do auth, ou que o auth já disse que caiu (aí quem
 * resolve é a pessoa, reconectando).
 */
export function precisaRenovar(metadata: MetadadosDaConexao, tokenExpiraEm: string | Date | null | undefined, agora = Date.now()): "nao" | "segundo_plano" | "agora" {
  if (metadata?.origem !== "auth" || typeof metadata.auth_email !== "string") return "nao";
  if (metadata.auth_estado === "vencida" || metadata.auth_estado === "nao_conectada") return "nao";
  if (tokenExpiraEm && new Date(tokenExpiraEm).getTime() <= agora) return "agora";
  const ultima = typeof metadata.sincronizado_em === "string" ? Date.parse(metadata.sincronizado_em) : Number.NaN;
  if (!Number.isFinite(ultima) || agora - ultima > RENOVAR_APOS_MS) return "segundo_plano";
  return "nao";
}

const renovacoes = new Map<string, Promise<void>>();
const ultimaTentativa = new Map<string, number>();

/**
 * Atualiza a cópia do token de uma empresa. Nunca lança: quem chama está no
 * meio de um envio, e auth fora do ar não pode derrubar a mensagem.
 *
 * Só "não conectou" e "venceu" apagam o token guardado. Erro de rede, 5xx ou
 * credencial do CRM errada deixam tudo como está.
 */
export function renovarConexaoMeta(tenantId: string, metadata: MetadadosDaConexao, encrypt: (value: string | null) => string | null): Promise<void> {
  const emAndamento = renovacoes.get(tenantId);
  if (emAndamento) return emAndamento;
  const email = typeof metadata?.auth_email === "string" ? metadata.auth_email : null;
  if (!email) return Promise.resolve();
  if (Date.now() - (ultimaTentativa.get(tenantId) ?? 0) < ESPERA_ENTRE_TENTATIVAS_MS) return Promise.resolve();
  ultimaTentativa.set(tenantId, Date.now());

  // O carimbo anterior entra na condição do update: se alguém sincronizou pela
  // tela no meio do caminho, esta renovação não escreve por cima.
  const anterior = typeof metadata?.sincronizado_em === "string" ? metadata.sincronizado_em : null;
  const condicao = "tenant_id = $1 and provider = $2 and metadata->>'origem' = 'auth' and metadata->>'sincronizado_em' is not distinct from $3";

  const trabalho = (async () => {
    try {
      const conexao = await buscarConexaoMeta(email);
      await query(
        `update integrations
         set access_token = $4, user_name = $5, token_expires_at = $6, metadata = (metadata - 'auth_estado') || $7::jsonb, updated_at = now()
         where ${condicao}`,
        [tenantId, META_PROVIDER, anterior, encrypt(conexao.token), conexao.meta.nome, conexao.meta.expiraEm, JSON.stringify({ escopos: conexao.meta.escopos, sincronizado_em: new Date().toISOString() })],
      );
    } catch (erro) {
      if (erro instanceof AuthMetaError && (erro.codigo === "nao_conectada" || erro.codigo === "vencida")) {
        await query(
          `update integrations
           set access_token = null, token_expires_at = null, metadata = metadata || $4::jsonb, updated_at = now()
           where ${condicao}`,
          [tenantId, META_PROVIDER, anterior, JSON.stringify({ auth_estado: erro.codigo, sincronizado_em: new Date().toISOString() })],
        ).catch(() => {});
      }
    } finally {
      renovacoes.delete(tenantId);
    }
  })();
  renovacoes.set(tenantId, trabalho);
  return trabalho;
}

type AuthUser = { id: string; tenant_id: string; name: string; email: string; role: string };

export type AuthMetaRouteDeps = {
  requireAuth: (request: FastifyRequest, reply: FastifyReply) => Promise<AuthUser | null>;
  canManage: (user: AuthUser) => boolean;
  checkRateLimit: (key: string, limit: number, windowMs: number) => boolean;
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
  /** E-mail do cookie `avila_sso` do pedido, já com a assinatura conferida. */
  emailDoSso: (request: FastifyRequest) => string | null;
  gravarCanais: (tenantId: string, canais: CanalDescoberto[]) => Promise<{ criados: number; atualizados: number }>;
  status: (tenantId: string) => Promise<Record<string, unknown>>;
};

const sincronizarSchema = z.object({ confirmar: z.boolean().optional() });

export function registerAuthMetaRoutes(app: FastifyInstance, deps: AuthMetaRouteDeps) {
  /**
   * Traz para a empresa a conexão da Meta de quem está logado.
   *
   * De quem é a conexão sai do cookie do SSO, não de `users.email`: esse campo
   * o administrador da empresa edita, e com ele bastaria escrever o e-mail de
   * outra pessoa para ler a Meta dela. Sessão aberta só com senha não vincula.
   *
   * Trocar a conta ligada à empresa pede `confirmar`: sem ele a rota devolve só
   * a prévia. É o que impede alguém da Ávila Ops, logado na empresa de um
   * cliente, de pôr os próprios números lá sem perceber.
   */
  app.post("/api/meta/sincronizar", async (request, reply) => {
    const user = await deps.requireAuth(request, reply);
    if (!user) return;
    if (!deps.canManage(user)) return reply.code(403).send({ error: "Permissao insuficiente." });
    if (!deps.checkRateLimit(`meta-sincronizar:${user.tenant_id}`, 10, 60 * 1000)) {
      return reply.code(429).send({ error: "Muitas tentativas. Aguarde um minuto." });
    }
    const { confirmar } = sincronizarSchema.parse(request.body ?? {});

    const email = deps.emailDoSso(request)?.trim().toLowerCase() ?? null;
    if (!email || email !== user.email.trim().toLowerCase()) {
      return reply.code(409).send({
        error: "Entre no CRM pela conta Avila Ops para vincular a Meta. Com e-mail e senha o CRM nao tem como saber de quem e a conexao.",
        code: "sso_obrigatorio",
      });
    }

    let conexao: ConexaoMetaDoAuth;
    try {
      conexao = await buscarConexaoMeta(email);
    } catch (erro) {
      if (erro instanceof AuthMetaError) {
        return reply.code(erro.status).send({ error: erro.message, code: erro.codigo, paginaDaMeta: paginaDaMeta() });
      }
      throw erro;
    }

    const canais = canaisDeAtivos(conexao.ativos);
    const atual = await query<{ metadata: Record<string, unknown> }>("select metadata from integrations where tenant_id = $1 and provider = $2", [user.tenant_id, META_PROVIDER]);
    const mesmaConta = atual.rows[0]?.metadata?.origem === "auth" && atual.rows[0].metadata.auth_email === email;
    if (!mesmaConta && !confirmar) {
      return { previa: true, conta: email, nome: conexao.meta.nome, numeros: canais.map((canal) => canal.numero ?? canal.numeroId) };
    }

    // `app_id` e `app_secret` ficam fora de propósito: empresa que ainda recebe
    // pelo webhook direto continua conferindo a assinatura com o segredo dela.
    await query(
      `insert into integrations (tenant_id, provider, access_token, user_name, connected_at, token_expires_at, metadata, updated_at)
       values ($1, $2, $3, $4, now(), $5, $6::jsonb, now())
       on conflict (tenant_id, provider)
       do update set access_token = excluded.access_token, user_name = excluded.user_name, connected_at = now(),
         token_expires_at = excluded.token_expires_at, metadata = (integrations.metadata - 'auth_estado') || excluded.metadata, updated_at = now()`,
      [
        user.tenant_id,
        META_PROVIDER,
        deps.encryptSecret(conexao.token),
        conexao.meta.nome,
        conexao.meta.expiraEm,
        JSON.stringify({
          origem: "auth",
          auth_email: email,
          meta_user_id: conexao.meta.usuarioId,
          escopos: conexao.meta.escopos,
          numeros: canais.length,
          sincronizado_em: new Date().toISOString(),
        }),
      ],
    );
    const gravados = await deps.gravarCanais(user.tenant_id, canais);

    await deps.recordEvent(
      user.tenant_id,
      "integration",
      "meta.sincronizada_pelo_auth",
      { conta: email, numeros: canais.length, ...gravados },
      user.id,
      null,
      (request as FastifyRequest & { requestId?: string }).requestId,
    );
    return { previa: false, ...(await deps.status(user.tenant_id)), ...gravados };
  });
}

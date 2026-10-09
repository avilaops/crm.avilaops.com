/**
 * Convite de quem entra na equipe, pedido à conta Ávila Ops (auth).
 *
 * O CRM não tem caixa de e-mail de sistema (cada empresa cadastra a sua, para
 * falar com os clientes dela). Quem escreve para a pessoa convidada é o auth:
 * `POST /api/provisionamento/acessos` garante a conta, libera o CRM e manda o
 * e-mail. Conta nova recebe o endereço de criar a senha; ao salvar, a pessoa
 * volta em `/api/auth/sso`, que abre a sessão do CRM.
 *
 * O endereço de criar a senha é uma chave da conta. Com o e-mail enviado ele
 * nem chega aqui; quando chega (o envio não saiu), é descartado: não vai a
 * tela, banco nem log.
 */

export type ResultadoDoConvite = {
  status: "enviado" | "falhou" | "pendente";
  /** Frase curta para a tela e para a lista de usuários. */
  detalhe: string;
};

export type PedidoDeConvite = {
  email: string;
  nome: string;
  empresa: string;
  /** Identificador da empresa no CRM: a mesma pessoa pode estar em mais de uma. */
  slugDaEmpresa: string;
  convidadoPor: string;
};

const TIMEOUT_MS = 10_000;

export const CONVITE_DESLIGADO = "O convite por e-mail ainda nao esta ligado neste ambiente. Avise a pessoa voce mesmo; ela entra com a conta Avila Ops.";

const MOTIVO_DO_AUTH: Record<string, string> = {
  sem_email: "A conta Avila Ops ainda nao envia e-mail. A pessoa foi liberada; avise-a voce mesmo.",
  limite: "Muitos convites para este e-mail na ultima hora. Tente de novo mais tarde.",
  falhou: "A conta Avila Ops nao conseguiu entregar o e-mail. Confira o endereco e envie de novo.",
};

function baseDoAuth() {
  return (process.env.SSO_BASE_URL ?? "https://auth.avilaops.com").replace(/\/$/, "");
}

/** Porta de entrada do CRM para quem acabou de criar a senha, já na empresa certa. */
export function entradaDoCrm(slugDaEmpresa: string) {
  const base = (process.env.CRM_BASE_URL ?? "https://crm.avilaops.com").replace(/\/$/, "");
  return `${base}/api/auth/sso?tenantSlug=${encodeURIComponent(slugDaEmpresa)}`;
}

/**
 * Pede o convite. Nunca lança: o usuário já foi criado no CRM, e o que
 * aconteceu com o convite é dado para a tela, não erro da requisição.
 *
 * As variáveis são lidas aqui dentro, e não no topo do arquivo, porque o
 * `dotenv` do servidor roda depois dos imports.
 */
export async function convidarPelaContaAvila(pedido: PedidoDeConvite): Promise<ResultadoDoConvite> {
  const id = process.env.AUTH_META_CLIENT_ID;
  const segredo = process.env.AUTH_META_CLIENT_SECRET;
  if (!id || !segredo) return { status: "pendente", detalhe: CONVITE_DESLIGADO };

  let resposta: Response;
  try {
    resposta = await fetch(`${baseDoAuth()}/api/provisionamento/acessos`, {
      method: "POST",
      headers: {
        authorization: `Basic ${Buffer.from(`${id}:${segredo}`).toString("base64")}`,
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: pedido.email.trim().toLowerCase(),
        nome: pedido.nome.trim().slice(0, 120),
        enviarConvite: true,
        empresa: pedido.empresa,
        convidadoPor: pedido.convidadoPor,
        destino: entradaDoCrm(pedido.slugDaEmpresa),
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { status: "falhou", detalhe: "Nao foi possivel falar com a conta Avila Ops agora. Envie o convite de novo em instantes." };
  }

  const dados = (await resposta.json().catch(() => null)) as { criada?: unknown; envio?: unknown; error?: unknown } | null;
  if (resposta.status === 401 || resposta.status === 403) {
    return { status: "falhou", detalhe: "A conta Avila Ops recusou a credencial do CRM. Avise a Avila Ops." };
  }
  if (!resposta.ok) {
    // 409 traz mensagem para quem convida (conta desligada no login único).
    const dito = resposta.status === 409 && typeof dados?.error === "string" ? dados.error.slice(0, 200) : null;
    return { status: "falhou", detalhe: dito ?? `A conta Avila Ops respondeu ${resposta.status}.` };
  }

  if (dados?.envio === "enviado") {
    return {
      status: "enviado",
      detalhe: dados.criada === true ? "com o endereco para criar a senha" : "a pessoa ja tinha conta Avila Ops",
    };
  }
  const motivo = typeof dados?.envio === "string" ? MOTIVO_DO_AUTH[dados.envio] : undefined;
  return { status: "falhou", detalhe: motivo ?? "A pessoa foi liberada, mas o e-mail do convite nao saiu." };
}

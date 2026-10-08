import { query } from "./db.js";

/**
 * Agente de IA do CRM.
 *
 * Fala o dialeto da API da OpenAI, que hoje é o denominador comum: OpenAI,
 * DeepSeek e Groq aceitam o mesmo formato de `chat/completions`. Trocar de
 * provedor é trocar `base_url` e chave na tela, sem tocar em código.
 *
 * Três decisões que valem explicar:
 *
 * 1. **Resposta em JSON com esquema.** Toda tarefa devolve estrutura, não
 *    prosa. Texto livre obrigaria a adivinhar onde termina o nome da empresa.
 * 2. **A IA propõe, a pessoa aplica.** Catalogação e triagem viram sugestão
 *    pendente. Deixar um modelo reescrever 4 mil contatos direto no banco é
 *    como dar acesso de escrita para um estagiário que nunca viu a base.
 * 3. **Todo uso vira registro** em `ai_runs`, com tokens e duração. Sem isso
 *    não há como responder "por que a conta subiu?".
 */

export const AI_PROVIDER = "ai";

export type AiConfig = {
  provider: string;
  baseUrl: string;
  model: string;
  apiKey: string;
};

export type AiConfigView = Omit<AiConfig, "apiKey"> & { hasKey: boolean; connectedAt: string | null };

const PADROES: Record<string, { baseUrl: string; model: string }> = {
  openai: { baseUrl: "https://api.openai.com/v1", model: "gpt-4.1-mini" },
  deepseek: { baseUrl: "https://api.deepseek.com/v1", model: "deepseek-chat" },
  groq: { baseUrl: "https://api.groq.com/openai/v1", model: "llama-3.3-70b-versatile" },
};

type IntegrationRow = {
  app_secret: string | null;
  user_name: string | null;
  metadata: Record<string, unknown>;
  connected_at: string | null;
};

function texto(metadata: Record<string, unknown>, chave: string, alternativa: string) {
  const valor = metadata[chave];
  return typeof valor === "string" && valor.trim() ? valor.trim() : alternativa;
}

export async function loadAiConfig(
  tenantId: string,
  decrypt: (value: string | null) => string | null,
): Promise<AiConfig | null> {
  const resultado = await query<IntegrationRow>(
    "select app_secret, user_name, metadata, connected_at from integrations where tenant_id = $1 and provider = $2",
    [tenantId, AI_PROVIDER],
  );
  const linha = resultado.rows[0];
  if (!linha?.app_secret) return null;

  const metadata = linha.metadata ?? {};
  const provedor = texto(metadata, "provider", "openai");
  const padrao = PADROES[provedor] ?? PADROES.openai;

  return {
    provider: provedor,
    baseUrl: texto(metadata, "baseUrl", padrao.baseUrl),
    model: texto(metadata, "model", padrao.model),
    apiKey: decrypt(linha.app_secret) ?? "",
  };
}

export async function readAiConfigView(tenantId: string): Promise<AiConfigView | null> {
  const resultado = await query<IntegrationRow>(
    "select app_secret, user_name, metadata, connected_at from integrations where tenant_id = $1 and provider = $2",
    [tenantId, AI_PROVIDER],
  );
  const linha = resultado.rows[0];
  if (!linha) return null;

  const metadata = linha.metadata ?? {};
  const provedor = texto(metadata, "provider", "openai");
  const padrao = PADROES[provedor] ?? PADROES.openai;

  return {
    provider: provedor,
    baseUrl: texto(metadata, "baseUrl", padrao.baseUrl),
    model: texto(metadata, "model", padrao.model),
    hasKey: Boolean(linha.app_secret),
    connectedAt: linha.connected_at,
  };
}

export async function saveAiConfig(
  tenantId: string,
  input: { provider: string; baseUrl?: string; model?: string; apiKey?: string },
  encrypt: (value: string | null) => string | null,
) {
  const padrao = PADROES[input.provider] ?? PADROES.openai;
  const metadata = {
    provider: input.provider,
    baseUrl: input.baseUrl?.trim() || padrao.baseUrl,
    model: input.model?.trim() || padrao.model,
  };

  // Chave em branco mantém a que já está lá: a tela nunca recebe a chave de
  // volta, então reenviar vazio é o caminho de quem só trocou o modelo.
  await query(
    `insert into integrations (tenant_id, provider, user_name, app_secret, metadata, connected_at, updated_at)
     values ($1, $2, $3, $4, $5::jsonb, now(), now())
     on conflict (tenant_id, provider) do update
       set user_name = excluded.user_name,
           app_secret = coalesce(excluded.app_secret, integrations.app_secret),
           metadata = integrations.metadata || excluded.metadata,
           updated_at = now()`,
    [tenantId, AI_PROVIDER, input.provider, input.apiKey ? encrypt(input.apiKey) : null, JSON.stringify(metadata)],
  );
}

export class AiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "AiError";
  }
}

type Mensagem = { role: "system" | "user"; content: string };

/**
 * Chamada crua ao provedor, com resposta obrigatoriamente em JSON no formato
 * pedido. `schema` vira `response_format` — o modelo não tem para onde fugir.
 */
async function conversar(config: AiConfig, mensagens: Mensagem[], schema: Record<string, unknown>, nome: string) {
  const resposta = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages: mensagens,
      temperature: 0.3,
      response_format: {
        type: "json_schema",
        json_schema: { name: nome, strict: true, schema },
      },
    }),
  });

  const corpo = (await resposta.json().catch(() => ({}))) as {
    choices?: { message?: { content?: string } }[];
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    error?: { message?: string };
  };

  if (!resposta.ok) {
    throw new AiError(corpo.error?.message ?? `provedor respondeu HTTP ${resposta.status}`);
  }

  const conteudo = corpo.choices?.[0]?.message?.content;
  if (!conteudo) throw new AiError("provedor devolveu resposta vazia");

  try {
    return {
      dados: JSON.parse(conteudo) as Record<string, unknown>,
      inputTokens: corpo.usage?.prompt_tokens ?? 0,
      outputTokens: corpo.usage?.completion_tokens ?? 0,
    };
  } catch {
    throw new AiError("provedor devolveu JSON inválido");
  }
}

export async function executar(
  tenantId: string,
  userId: string | null,
  config: AiConfig,
  job: string,
  mensagens: Mensagem[],
  schema: Record<string, unknown>,
) {
  const inicio = Date.now();
  try {
    const resultado = await conversar(config, mensagens, schema, job);
    await query(
      `insert into ai_runs (tenant_id, user_id, job, model, status, input_tokens, output_tokens, duration_ms)
       values ($1, $2, $3, $4, 'ok', $5, $6, $7)`,
      [tenantId, userId, job, config.model, resultado.inputTokens, resultado.outputTokens, Date.now() - inicio],
    );
    return resultado.dados;
  } catch (erro) {
    const mensagem = erro instanceof Error ? erro.message : String(erro);
    await query(
      `insert into ai_runs (tenant_id, user_id, job, model, status, duration_ms, error)
       values ($1, $2, $3, $4, 'error', $5, $6)`,
      [tenantId, userId, job, config.model, Date.now() - inicio, mensagem.slice(0, 500)],
    );
    throw erro;
  }
}

// ── Voz da casa ──────────────────────────────────────────────────────────────

const VOZ = `Você escreve pela Ávila Ops, empresa brasileira de infraestrutura e automação
para empresas que já vendem: sites, domínio, e-mail corporativo, automação e suporte.

Como a casa escreve:
- português do Brasil, direto, frase curta, voz ativa;
- concreto e operacional: fala de pedido, estoque, prazo, domínio vencendo, site fora do ar;
- sem hype, sem "solução inovadora", sem "transformação digital", sem emoji;
- pode ser incisivo e fazer pergunta que incomoda, mas nunca promete milagre nem assusta com número inventado;
- nada de inventar dado, preço, prazo ou caso de cliente.`;

export const TRIAGEM_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["categoria", "empresa", "pessoa", "etiquetas", "cadastrar", "motivo"],
  properties: {
    categoria: {
      type: "string",
      enum: ["cliente", "fornecedor", "oportunidade", "cobranca", "automatico", "pessoal", "spam"],
    },
    empresa: { type: "string" },
    pessoa: { type: "string" },
    etiquetas: { type: "array", items: { type: "string" }, maxItems: 4 },
    cadastrar: { type: "boolean" },
    motivo: { type: "string" },
  },
} as const;

export function promptTriagem(remetentes: { email: string; name: string | null; last_subject: string | null }[]): Mensagem[] {
  return [
    {
      role: "system",
      content: `${VOZ}

Você faz triagem de remetentes de e-mail para um CRM. Para o remetente informado, decida:
- categoria (cliente, fornecedor, oportunidade, cobranca, automatico, pessoal, spam);
- nome provável da PESSOA (vazio se for caixa de setor, tipo financeiro@ ou nfe@);
- nome comercial da EMPRESA deduzido do domínio (ex.: guflapecas.com.br -> "Gufla Peças"). Domínio genérico (gmail, hotmail, outlook, terra, yahoo) não vira empresa: devolva vazio;
- até 4 etiquetas curtas em minúsculas, com hífen (ex.: "transporte", "maquinas-pecas");
- cadastrar: true só quando for gente de verdade com quem faz sentido conversar. Remetente automático, marketing em massa e spam recebem false;
- motivo: uma frase curta explicando a decisão.

Não invente empresa que o domínio não sustenta.`,
    },
    {
      role: "user",
      content: remetentes
        .map((r) => `e-mail: ${r.email}\nnome no cabeçalho: ${r.name ?? "(vazio)"}\núltimo assunto: ${r.last_subject ?? "(vazio)"}`)
        .join("\n---\n"),
    },
  ];
}

export const CATALOGO_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["nome", "empresa", "etiquetas", "confianca"],
  properties: {
    nome: { type: "string" },
    empresa: { type: "string" },
    etiquetas: { type: "array", items: { type: "string" }, maxItems: 4 },
    confianca: { type: "string", enum: ["alta", "media", "baixa"] },
  },
} as const;

export function promptCatalogo(contato: { name: string; email: string | null; phone: string | null; company: string | null }): Mensagem[] {
  return [
    {
      role: "system",
      content: `${VOZ}

Você organiza a base de contatos de um CRM. O cadastro veio de agenda de celular e está sujo:
nomes como "Fabio Motorista Usina Nardini" ou "financeiro NARDINI".

Devolva:
- nome: o nome da pessoa, limpo, em Capitalização Normal. Se o registro for uma caixa de setor ou uma empresa (sem pessoa), use o formato "Setor - Empresa" ou o nome da empresa;
- empresa: nome comercial, ou vazio quando não der para saber;
- etiquetas: até 4, minúsculas com hífen, do setor quando der para deduzir (transporte, industria, maquinas-pecas, usinas-agro, eletrica-hidraulica, quimica-diversos, cobranca-servicos, construcao, alimentacao, saude, servicos);
- confianca: alta quando o registro deixa claro; baixa quando você está chutando.

Não invente empresa a partir de nome próprio comum. Na dúvida, empresa vazia e confiança baixa.`,
    },
    {
      role: "user",
      content: `nome atual: ${contato.name}\ne-mail: ${contato.email ?? "(vazio)"}\ntelefone: ${contato.phone ?? "(vazio)"}\nempresa atual: ${contato.company ?? "(vazio)"}`,
    },
  ];
}

export const CAMPANHA_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["assunto", "assuntos_alternativos", "previa", "corpo"],
  properties: {
    assunto: { type: "string" },
    assuntos_alternativos: { type: "array", items: { type: "string" }, minItems: 2, maxItems: 3 },
    previa: { type: "string" },
    corpo: { type: "string" },
  },
} as const;

export function promptCampanha(briefing: string, publico: string): Mensagem[] {
  return [
    {
      role: "system",
      content: `${VOZ}

Você escreve o e-mail de uma newsletter. Devolva:
- assunto: até 60 caracteres, sem ponto final, que dê vontade de abrir sem parecer isca;
- assuntos_alternativos: 2 a 3 variações para teste;
- previa: uma linha curta que aparece depois do assunto na caixa de entrada;
- corpo: o e-mail em texto puro, parágrafos separados por linha em branco. Comece por uma cena concreta ou uma pergunta que o leitor reconheça; termine com um convite claro e único.

O corpo não leva assinatura nem rodapé de descadastro: a plataforma acrescenta.
Entre 200 e 400 palavras. Nada de bullet decorativo nem título em maiúsculas.`,
    },
    { role: "user", content: `Assunto do e-mail (briefing): ${briefing}\nPúblico: ${publico}` },
  ];
}

export async function testarConfig(config: AiConfig) {
  const resposta = await fetch(`${config.baseUrl.replace(/\/+$/, "")}/chat/completions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${config.apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: "user", content: "Responda apenas: ok" }],
      max_tokens: 5,
    }),
  });
  const corpo = (await resposta.json().catch(() => ({}))) as { error?: { message?: string } };
  if (!resposta.ok) return { ok: false, detail: corpo.error?.message ?? `HTTP ${resposta.status}` };
  return { ok: true, detail: `${config.provider} respondeu com o modelo ${config.model}` };
}

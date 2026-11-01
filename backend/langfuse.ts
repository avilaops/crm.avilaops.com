import type { LangfuseGeneration, LangfuseTool } from "@langfuse/tracing";

type Runtime = {
  start: typeof import("@langfuse/tracing").startObservation;
  flush: () => Promise<void>;
  shutdown: () => Promise<void>;
};
type Operacao = "triagem" | "catalogo" | "campanha" | "teste-provedor" | "transcricao" | "geracao";
const OPERACOES = new Set<string>(["triagem", "catalogo", "campanha", "teste-provedor", "transcricao", "geracao"]);
let inicializacao: Promise<Runtime | null> | undefined;

export function destinoLangfuseSeguro(value?: string): string | null {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash) return null;
    return url.toString().replace(/\/$/, "");
  } catch { return null; }
}

export function langfuseConfigurado(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.LANGFUSE_ENABLED === "true" && env.LANGFUSE_TRACING_ENABLED !== "false"
    && Boolean(env.LANGFUSE_PUBLIC_KEY?.trim() && env.LANGFUSE_SECRET_KEY?.trim()
      && destinoLangfuseSeguro(env.LANGFUSE_BASE_URL))
    && !env.OTEL_EXPORTER_OTLP_HEADERS?.trim() && !env.OTEL_EXPORTER_OTLP_TRACES_HEADERS?.trim();
}

async function limitar(tarefa: Promise<void>): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([tarefa, new Promise<void>((resolve) => { timer = setTimeout(resolve, 4_000); })]);
  } finally { if (timer) clearTimeout(timer); }
}

async function iniciar(): Promise<Runtime | null> {
  if (!langfuseConfigurado()) return null;
  inicializacao ??= (async () => {
    try {
      const [{ NodeSDK }, { LangfuseSpanProcessor }, { startObservation }] = await Promise.all([
        import("@opentelemetry/sdk-node"), import("@langfuse/otel"), import("@langfuse/tracing"),
      ]);
      const processor = new LangfuseSpanProcessor({
        baseUrl: destinoLangfuseSeguro(process.env.LANGFUSE_BASE_URL)!,
        timeout: 3,
        mediaUploadEnabled: false,
        shouldExportSpan: ({ otelSpan }) => otelSpan.instrumentationScope.name === "langfuse-sdk"
          && otelSpan.name.startsWith("crm.ai.") && OPERACOES.has(otelSpan.name.slice(7)),
      });
      const sdk = new NodeSDK({
        serviceName: "crm.avilaops.com",
        autoDetectResources: false,
        instrumentations: [],
        spanProcessors: [processor],
      });
      sdk.start();
      const runtime = {
        start: startObservation,
        flush: () => limitar(processor.forceFlush()),
        shutdown: () => limitar(sdk.shutdown()),
      };
      process.once("beforeExit", () => { void runtime.shutdown().catch(() => {}); });
      return runtime;
    } catch {
      console.warn("[langfuse] Rastreamento indisponível; operação continua sem telemetria.");
      return null;
    }
  })();
  return inicializacao;
}

export async function encerrarLangfuse(): Promise<void> {
  try { await (await inicializacao)?.shutdown(); } catch { /* não impede o encerramento */ }
}

export function usoTokens(input?: number, output?: number): Record<string, number> {
  const usage: Record<string, number> = {};
  if (typeof input === "number" && Number.isFinite(input) && input >= 0) usage.input = input;
  if (typeof output === "number" && Number.isFinite(output) && output >= 0) usage.output = output;
  return usage;
}

/** O callback roda uma única vez, mesmo quando a inicialização/exportação falha. */
export async function rastrearIa<T>(
  operacao: string,
  modelo: string | undefined,
  executar: () => Promise<T>,
  resumo: (resultado: T) => { ok: boolean; usage?: Record<string, number> } = () => ({ ok: true }),
): Promise<T> {
  const runtime = await iniciar();
  const nome: Operacao = OPERACOES.has(operacao) ? operacao as Operacao : "geracao";
  let observation: LangfuseGeneration | LangfuseTool | undefined;
  try {
    const attributes = { input: { conteudoCapturado: false }, metadata: { funcionalidade: nome } };
    observation = nome === "transcricao"
      ? runtime?.start(`crm.ai.${nome}`, attributes, { asType: "tool" })
      : runtime?.start(`crm.ai.${nome}`, {
        ...attributes,
        // Modelos são configuração livre: só nomes, nunca URLs/credenciais.
        model: modelo && /^[a-zA-Z0-9_.:/-]{1,120}$/.test(modelo) ? modelo : undefined,
      }, { asType: "generation" });
  } catch { /* falha de telemetria não afeta o provedor */ }
  try {
    const resultado = await executar();
    try {
      const estado = resumo(resultado);
      observation?.update({
        output: { status: estado.ok ? "success" : "error", conteudoCapturado: false },
        level: estado.ok ? "DEFAULT" : "ERROR",
        ...(estado.ok ? {} : { statusMessage: "Operação de IA não concluída" }),
      });
      if (estado.usage && observation && nome !== "transcricao") {
        (observation as LangfuseGeneration).update({ usageDetails: estado.usage });
      }
    } catch { /* preserva resultado original */ }
    return resultado;
  } catch (error) {
    try { observation?.update({ level: "ERROR", statusMessage: "Falha na operação de IA" }); } catch { /* preserva erro original */ }
    throw error;
  } finally {
    try { observation?.end(); if (observation) await runtime?.flush(); } catch { /* exportação não altera sucesso/erro */ }
  }
}

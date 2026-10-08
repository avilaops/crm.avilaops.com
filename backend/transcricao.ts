/**
 * Transcrição de áudio do WhatsApp pelo Avila IA.
 *
 * O problema que isto resolve: hoje um áudio de dois minutos aparece no inbox
 * como `[audio]`. Quem atende precisa parar tudo, colocar o fone e ouvir — e
 * nada disso vira dado, então funil, busca e relatório ignoram a maior parte do
 * que o cliente disse. Depois daqui, o áudio vira texto no corpo da mensagem,
 * com o original guardado no metadata.
 *
 * Duas decisões:
 *
 * 1. **Não bloqueia o webhook.** A Meta reenvia o evento se demorarmos para
 *    responder, e transcrever leva segundos. Então a mensagem entra na hora com
 *    `[audio]` e o texto chega por update logo depois. Inbox lento é pior que
 *    inbox que completa sozinho.
 *
 * 2. **Falha em silêncio, com registro.** Sem `IA_API_KEY`, com o serviço fora
 *    do ar ou com a cota estourada, a mensagem continua entrando normalmente.
 *    Transcrição é melhoria; não pode derrubar a ingestão do WhatsApp.
 */

const IA_BASE = process.env.IA_BASE_URL ?? "https://ia.avilaops.com";
const META_GRAPH_VERSION = "v23.0";

/** Tipos de mensagem do WhatsApp que valem transcrever. */
const TIPOS_DE_AUDIO = new Set(["audio", "voice", "ptt"]);

export function ehMensagemDeAudio(tipo: string): boolean {
  return TIPOS_DE_AUDIO.has(tipo);
}

export function transcricaoLigada(): boolean {
  return Boolean(process.env.IA_API_KEY);
}

interface ResultadoTranscricao {
  texto: string;
  idioma: string | null;
  segundos: number | null;
  jobId: string | null;
}

/**
 * Baixa o áudio do WhatsApp. A Meta dá uma URL de mídia que exige o mesmo
 * token da conta — não é link público, então a busca é em dois passos.
 */
async function baixarAudioDaMeta(mediaId: string, accessToken: string): Promise<Buffer | null> {
  const meta = await fetch(`https://graph.facebook.com/${META_GRAPH_VERSION}/${mediaId}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!meta.ok) return null;

  const { url } = (await meta.json()) as { url?: string };
  if (!url) return null;

  const arquivo = await fetch(url, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(60_000),
  });
  if (!arquivo.ok) return null;

  return Buffer.from(await arquivo.arrayBuffer());
}

/**
 * Manda para o Avila IA e devolve o texto. `contexto` são termos do negócio
 * (nome da empresa, produtos) que ajudam o modelo a acertar nome próprio.
 */
export async function transcrever(
  audio: Buffer,
  contexto?: string,
): Promise<ResultadoTranscricao | null> {
  const chave = process.env.IA_API_KEY;
  if (!chave) return null;

  try {
    const resposta = await fetch(`${IA_BASE}/api/v1/transcricoes?aguardar_ms=180000`, {
      method: "POST",
      headers: { authorization: `Bearer ${chave}`, "content-type": "application/json" },
      body: JSON.stringify({
        base64: audio.toString("base64"),
        nome: "whatsapp.ogg",
        contexto: contexto ?? undefined,
      }),
      signal: AbortSignal.timeout(200_000),
    });

    if (!resposta.ok && resposta.status !== 202) {
      const detalhe = await resposta.text().catch(() => "");
      console.warn("[transcricao] Avila IA recusou:", resposta.status, detalhe.slice(0, 200));
      return null;
    }

    const dados = (await resposta.json()) as {
      id?: string;
      status?: string;
      resultado?: { texto?: string; idioma?: string; duracao_segundos?: number };
    };

    if (dados.status !== "concluido" || !dados.resultado?.texto) return null;

    return {
      texto: dados.resultado.texto,
      idioma: dados.resultado.idioma ?? null,
      segundos: dados.resultado.duracao_segundos ?? null,
      jobId: dados.id ?? null,
    };
  } catch (erro) {
    console.warn("[transcricao] falhou:", erro instanceof Error ? erro.message : erro);
    return null;
  }
}

/**
 * O caminho completo, para o webhook chamar sem `await`: baixa, transcreve e
 * grava. Recebe o `executarQuery` do server para não duplicar o pool.
 */
export async function transcreverEGravar(input: {
  mensagemId: string;
  tenantId: string;
  mediaId: string;
  accessToken: string;
  contexto?: string;
  executarQuery: (texto: string, valores: unknown[]) => Promise<unknown>;
}): Promise<void> {
  if (!transcricaoLigada()) return;

  try {
    const audio = await baixarAudioDaMeta(input.mediaId, input.accessToken);
    if (!audio) {
      console.warn("[transcricao] não consegui baixar a mídia", input.mediaId);
      return;
    }

    const resultado = await transcrever(audio, input.contexto);
    if (!resultado) return;

    // O `[audio]` some do corpo e o original fica no metadata: se alguém
    // questionar o que foi dito, dá para conferir de onde veio o texto.
    await input.executarQuery(
      `update messages
         set body = $1,
             metadata = metadata || $2::jsonb
       where id = $3 and tenant_id = $4`,
      [
        resultado.texto,
        JSON.stringify({
          transcricao: {
            por: "ia.avilaops.com",
            job_id: resultado.jobId,
            idioma: resultado.idioma,
            segundos: resultado.segundos,
            em: new Date().toISOString(),
          },
        }),
        input.mensagemId,
        input.tenantId,
      ],
    );

    console.info("[transcricao] mensagem %s transcrita (%ss)", input.mensagemId, resultado.segundos);
  } catch (erro) {
    console.warn("[transcricao] erro ao processar:", erro instanceof Error ? erro.message : erro);
  }
}

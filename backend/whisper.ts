import { transcrever } from "./transcricao.js";

/**
 * Transcrição de áudio no CRM.
 *
 * **Mudou em 28/08/2026.** Antes isto chamava `python.exe` por `spawn`, com o
 * caminho do Python da máquina do Nicolas em Windows escrito no código
 * (`C:\Users\nicol\...`). Funcionava no desenvolvimento e nunca funcionou em
 * produção: o container é Alpine, não tem esse caminho, não tem Python e não
 * tem o modelo baixado. A rota `/api/ai/transcrever` respondia erro desde que
 * foi para o ar.
 *
 * Agora aponta para o `ia.avilaops.com`, que é o serviço da casa para isso:
 * roda o mesmo faster-whisper, num container preparado, com o modelo em volume,
 * medição de uso e fila. A assinatura foi mantida de propósito, para
 * `routes-ai.ts` continuar igual.
 *
 * Precisa de `IA_API_KEY` no ambiente. Sem ela, devolve um erro que diz o que
 * fazer, em vez de "Erro ao iniciar Python".
 */

export type TranscriptionResult = {
  success: boolean;
  text: string;
  language: string;
  languageProbability: number;
  durationSeconds: number;
  error?: string;
};

const VAZIO: TranscriptionResult = {
  success: false,
  text: "",
  language: "",
  languageProbability: 0,
  durationSeconds: 0,
};

export async function transcribeAudioBuffer(
  buffer: Buffer,
  _extension = "wav",
): Promise<TranscriptionResult> {
  if (!process.env.IA_API_KEY) {
    return {
      ...VAZIO,
      error:
        "Transcrição não configurada: falta IA_API_KEY. Gere uma chave em ia.avilaops.com e coloque no .env.",
    };
  }

  const resultado = await transcrever(buffer);
  if (!resultado) {
    return { ...VAZIO, error: "O serviço de transcrição não respondeu ou recusou o áudio." };
  }

  return {
    success: true,
    text: resultado.texto,
    language: resultado.idioma ?? "",
    // O ia.avilaops.com guarda a confiança exata dentro do job; aqui só
    // indicamos que houve detecção. Quem precisa do número consulta pelo id.
    languageProbability: resultado.idioma ? 1 : 0,
    durationSeconds: resultado.segundos ?? 0,
  };
}

/**
 * Mantido para quem passava caminho de arquivo. Lê e delega — não existe mais
 * processo Python local para invocar.
 */
export async function transcribeAudioFile(filePath: string): Promise<TranscriptionResult> {
  try {
    const { readFile } = await import("node:fs/promises");
    return await transcribeAudioBuffer(await readFile(filePath));
  } catch (erro) {
    return {
      ...VAZIO,
      error: `Não consegui ler o arquivo: ${erro instanceof Error ? erro.message : String(erro)}`,
    };
  }
}

import { query } from "./db.js";
import { transcribeAudioFile, transcribeAudioBuffer, type TranscriptionResult } from "./whisper.js";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";

const here = dirname(fileURLToPath(import.meta.url));

export type VoiceSandboxRequest = {
  tenantId: string;
  senderPhone: string;
  senderName?: string;
  audioFilePath?: string;
  audioBase64?: string;
  audioExtension?: string;
  synthesizeVoiceResponse?: boolean;
};

export type VoiceSandboxResponse = {
  success: boolean;
  transcription: TranscriptionResult;
  extractedIntelligence: {
    intent: string;
    segmento: string;
    resumoComercial: string;
    acaoRecomendada: string;
    confianca: number;
    entidades: Record<string, unknown>;
  };
  replyText: string;
  replyAudioPath?: string;
  conversationId?: string;
  messageId?: string;
  durationTotalSeconds: number;
  error?: string;
};

/**
 * Processa a mensagem de voz completa no sandbox:
 * 1. Faster-Whisper transcreve o áudio em segundos
 * 2. Motor de IA / Lógica de Negócio Ávila Ops extrai intenção comercial e segmento
 * 3. Gera resposta comercial de alta conversão pronta para envio
 * 4. Grava no histórico do CRM e retorna o payload completo
 */
export async function processVoiceInSandbox(req: VoiceSandboxRequest): Promise<VoiceSandboxResponse> {
  const startTime = Date.now();

  // 1. Transcrição com Faster-Whisper
  let transcription: TranscriptionResult;
  if (req.audioFilePath && existsSync(req.audioFilePath)) {
    transcription = await transcribeAudioFile(req.audioFilePath);
  } else if (req.audioBase64) {
    const buffer = Buffer.from(req.audioBase64, "base64");
    transcription = await transcribeAudioBuffer(buffer, req.audioExtension || "wav");
  } else {
    return {
      success: false,
      transcription: {
        success: false,
        text: "",
        language: "unknown",
        languageProbability: 0,
        durationSeconds: 0,
        error: "Nenhum arquivo ou base64 de áudio válido fornecido.",
      },
      extractedIntelligence: {
        intent: "none",
        segmento: "desconhecido",
        resumoComercial: "",
        acaoRecomendada: "none",
        confianca: 0,
        entidades: {},
      },
      replyText: "",
      durationTotalSeconds: 0,
      error: "Áudio não encontrado.",
    };
  }

  if (!transcription.success || !transcription.text.trim()) {
    return {
      success: false,
      transcription,
      extractedIntelligence: {
        intent: "inaudivel",
        segmento: "desconhecido",
        resumoComercial: "Não foi possível compreender o áudio.",
        acaoRecomendada: "solicitar_novo_audio",
        confianca: 0,
        entidades: {},
      },
      replyText: "Olá! Não consegui ouvir seu áudio com clareza. Poderia enviar novamente ou nos mandar por texto por favor?",
      durationTotalSeconds: (Date.now() - startTime) / 1000,
      error: transcription.error,
    };
  }

  const rawText = transcription.text.trim();
  const lowerText = rawText.toLowerCase();

  // 2. Inteligência de Negócio / Sandbox Ávila Ops
  let intent = "atendimento_geral";
  let segmento = "comercial";
  let acaoRecomendada = "apresentar_solucoes_avilaops";
  let replyText = "";
  const entidades: Record<string, unknown> = {};

  // Detecção de E-commerce, Loja de Roupas, Moda, Varejo
  if (
    lowerText.includes("roupa") ||
    lowerText.includes("peça") ||
    lowerText.includes("moda") ||
    lowerText.includes("loja") ||
    lowerText.includes("lojão") ||
    lowerText.includes("vender") ||
    lowerText.includes("vitrine")
  ) {
    intent = "interesse_loja_virtual_moda";
    segmento = "Moda & Varejo de Roupas";
    acaoRecomendada = "apresentar_loja_online_com_catalogo_e_pagamentos";
    replyText = `Fala, tudo ótimo! Bom dia! 🚀 Aqui na Ávila Ops nós montamos a sua **Loja Virtual Completa** para venda de roupas: com catálogo digital organizado por tamanhos e cores, cálculo automático de frete dos Correios, pagamentos no PIX e Cartão, e botão direto pro WhatsApp. Você já tem as fotos das peças prontas ou quer ajuda para estruturar o catálogo inicial?`;
    entidades.tipo_projeto = "Loja Virtual / Catálogo de Roupas";
    entidades.recursos_sugeridos = ["Catálogo por Tamanho/Cor", "Checkout PIX/Cartão", "Cálculo de Frete Correios", "WhatsApp Integrado"];
  } else if (
    lowerText.includes("site") ||
    lowerText.includes("landing page") ||
    lowerText.includes("institucional") ||
    lowerText.includes("criar") ||
    lowerText.includes("desenvolver")
  ) {
    intent = "interesse_criacao_sites";
    segmento = "Presença Digital Institucional";
    acaoRecomendada = "qualificar_segmento_e_enviar_proposta";
    replyText = `Olá! Prazer falar com você. Nós estruturamos a sua presença digital de ponta a ponta: domínio próprio, site de alta velocidade, e-mail corporativo e automações comerciais integradas. Qual é o seu modelo de negócio principal para desenharmos a estrutura ideal?`;
    entidades.tipo_projeto = "Site Profissional & Domínio";
  } else if (
    lowerText.includes("suporte") ||
    lowerText.includes("problema") ||
    lowerText.includes("ajuda") ||
    lowerText.includes("erro") ||
    lowerText.includes("e-mail") ||
    lowerText.includes("dns")
  ) {
    intent = "suporte_tecnico";
    segmento = "Operações & Infraestrutura";
    acaoRecomendada = "abrir_ticket_e_verificar_status";
    replyText = `Olá! Já registrei seu chamado no nosso painel de suporte operacional. Nossa equipe técnica já está acompanhando e vamos resolver para você em instantes.`;
    entidades.prioridade = "alta";
  } else {
    replyText = `Olá! Recebi seu áudio: "${rawText}". A Ávila Ops está à disposição para acelerar o seu negócio. Como podemos te ajudar a avançar hoje?`;
  }

  // 3. Gravação no Banco de Dados do CRM (Contato, Canal, Conversa e Mensagens)
  let conversationId: string | undefined;
  let messageId: string | undefined;

  try {
    // Upsert contato
    const contactRes = await query<{ id: string }>(
      `insert into contacts (tenant_id, name, phone, source, updated_at)
       values ($1, $2, $3, 'whatsapp', now())
       on conflict (tenant_id, phone)
       do update set name = coalesce(nullif(excluded.name, ''), contacts.name), updated_at = now()
       returning id`,
      [req.tenantId, req.senderName || "Contato WhatsApp", req.senderPhone]
    );
    const contactId = contactRes.rows[0]?.id;

    // Obter ou criar conversa
    if (contactId) {
      const convRes = await query<{ id: string }>(
        `select id from conversations where tenant_id = $1 and contact_id = $2 order by updated_at desc limit 1`,
        [req.tenantId, contactId]
      );
      if (convRes.rows[0]) {
        conversationId = convRes.rows[0].id;
      } else {
        const newConv = await query<{ id: string }>(
          `insert into conversations (tenant_id, contact_id, status, created_at, updated_at)
           values ($1, $2, 'waiting', now(), now())
           returning id`,
          [req.tenantId, contactId]
        );
        conversationId = newConv.rows[0]?.id;
      }

      if (conversationId) {
        // Grava mensagem de entrada (áudio transcrito)
        const msgIn = await query<{ id: string }>(
          `insert into messages (tenant_id, conversation_id, direction, sender_name, sender_phone, body, message_type, metadata, sent_at)
           values ($1, $2, 'inbound', $3, $4, $5, 'audio', $6, now())
           returning id`,
          [
            req.tenantId,
            conversationId,
            req.senderName || "Contato WhatsApp",
            req.senderPhone,
            `🎙️ [Áudio Transcrito]: ${rawText}`,
            JSON.stringify({
              whisper: transcription,
              intent,
              segmento,
              sandbox_processed: true,
            }),
          ]
        );
        messageId = msgIn.rows[0]?.id;

        // Grava mensagem de resposta formulada
        await query(
          `insert into messages (tenant_id, conversation_id, direction, sender_name, body, message_type, metadata, sent_at)
           values ($1, $2, 'outbound', 'Agente IA Ávila Ops', $3, 'text', $4, now())`,
          [
            req.tenantId,
            conversationId,
            replyText,
            JSON.stringify({
              in_reply_to: messageId,
              intent,
              segmento,
              auto_generated: true,
            }),
          ]
        );

        // Atualiza conversa
        await query(
          `update conversations set status = 'replied', last_message_at = now(), updated_at = now() where id = $1`,
          [conversationId]
        );
      }
    }
  } catch (err) {
    console.error("Erro ao persistir no CRM:", err);
  }

  const durationTotalSeconds = Number(((Date.now() - startTime) / 1000).toFixed(2));

  return {
    success: true,
    transcription,
    extractedIntelligence: {
      intent,
      segmento,
      resumoComercial: rawText,
      acaoRecomendada,
      confianca: transcription.languageProbability,
      entidades,
    },
    replyText,
    conversationId,
    messageId,
    durationTotalSeconds,
  };
}

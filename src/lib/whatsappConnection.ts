import type { ConnectionState } from './connection'
import type { MessageriaStatus } from './messageria'
import { formatPhoneBR } from './format'

/**
 * Estado da conexão do WhatsApp, montado a partir do que o servidor sabe.
 *
 * Fica separado da tela para ser testado sem navegador: é aqui que mora a
 * decisão de dizer "conectado" — e dizer isso sem ter certeza foi o erro que o
 * CRM já cometeu (canal "Ativo" com token morto, QR parado em "connecting").
 */

type ChannelLike = { id: string; provider: string; status: string; phone_number: string | null; display_name: string }

export type WhatsAppNumber = { id: string; label: string; isDefault: boolean; isTest: boolean }

export type WhatsAppConnectionView = {
  state: ConnectionState
  /** Frase para quem não é técnico; `null` quando está tudo certo. */
  reason: string | null
  /** Por onde a conta está ligada. */
  via: 'messageria' | 'meta-direta' | null
  numbers: WhatsAppNumber[]
  /** Canais por QR Code (WhatsApp Web): não oficiais, só para avisar. */
  unofficial: { id: string; label: string; neverCompleted: boolean }[]
}

const UNOFFICIAL = ['qrcode', 'evolution']

export function describeWhatsAppConnection(messageria: MessageriaStatus | null, channels: ChannelLike[]): WhatsAppConnectionView {
  const unofficial = channels
    .filter((channel) => UNOFFICIAL.includes(channel.provider))
    .map((channel) => ({
      id: channel.id,
      label: channel.phone_number && /\d/.test(channel.phone_number) ? formatPhoneBR(channel.phone_number) : channel.display_name,
      neverCompleted: channel.status === 'connecting',
    }))

  if (messageria?.connected) {
    const numbers = (messageria.canais ?? []).map((canal) => ({
      id: canal.id,
      label: canal.numero ? formatPhoneBR(canal.numero) : 'Número sem identificação',
      isDefault: Boolean(canal.padrao) || canal.id === messageria.canalId,
      isTest: Boolean(canal.teste),
    }))

    if (messageria.erro) {
      return {
        state: 'error',
        reason: `Não conseguimos falar com a plataforma que envia as mensagens. Detalhe: ${messageria.erro}`,
        via: 'messageria',
        numbers,
        unofficial,
      }
    }
    if (numbers.length === 0) {
      return { state: 'degraded', reason: 'A conta está ligada, mas ainda não tem número de WhatsApp.', via: 'messageria', numbers, unofficial }
    }
    if (messageria.assinaturaRegistrada === false) {
      return {
        state: 'degraded',
        reason: 'As mensagens saem, mas as respostas dos clientes não chegam aqui. Reconecte para registrar o recebimento.',
        via: 'messageria',
        numbers,
        unofficial,
      }
    }
    if (numbers.every((number) => number.isTest)) {
      return {
        state: 'degraded',
        reason: 'Só há o número de teste da Meta. Clientes de verdade não recebem por ele.',
        via: 'messageria',
        numbers,
        unofficial,
      }
    }
    return { state: 'connected', reason: null, via: 'messageria', numbers, unofficial }
  }

  // Caminho antigo: Cloud API falada direto daqui, com o app Meta do CRM.
  const direct = channels.filter((channel) => channel.provider === 'whatsapp' && channel.status === 'connected')
  if (direct.length > 0) {
    return {
      state: 'degraded',
      reason: 'Ligado pelo caminho antigo, direto na Meta, que deixou de ser o oficial do CRM. Fale com a Ávila Ops para passar para a Messageria.',
      via: 'meta-direta',
      numbers: direct.map((channel) => ({
        id: channel.id,
        label: channel.phone_number ? formatPhoneBR(channel.phone_number) : channel.display_name,
        isDefault: false,
        isTest: false,
      })),
      unofficial,
    }
  }

  return { state: 'disconnected', reason: null, via: null, numbers: [], unofficial }
}

import type { Page } from '../types'

/**
 * Checklist de ativação do Início.
 *
 * Cada item é concluído pelo dado real — canal conectado, segundo usuário
 * ativo, contato na base, mensagem de boas-vindas gravada —, nunca por um
 * clique em "marcar como feito". Se a pessoa desconecta o WhatsApp, o item
 * volta a pendente sozinho, porque a verdade é o estado da conta.
 */

/**
 * Caminhos oficiais. QR Code (WhatsApp Web) não conta: a Meta não o permite.
 *
 * Número descoberto pela conta da Meta (`metadata.origem === 'auth'`) também
 * não conta: ele envia, mas não recebe, e o passo promete "receba e responda".
 */
export const OFFICIAL_WHATSAPP_PROVIDERS = ['messageria', 'whatsapp']

export type ActivationSnapshot = {
  channels: { provider: string; status: string; metadata?: Record<string, unknown> | null }[]
  activeUsers: number
  contacts: number
  welcomeMessage: string | null
  aiAutonomousReply: boolean
}

export type ActivationStepId = 'whatsapp' | 'equipe' | 'contatos' | 'boas-vindas'

export type ActivationStep = {
  id: ActivationStepId
  title: string
  outcome: string
  duration: string
  done: boolean
  action: { label: string; page: Page }
}

export function hasOfficialWhatsApp(channels: ActivationSnapshot['channels']) {
  return channels.some(
    (channel) => OFFICIAL_WHATSAPP_PROVIDERS.includes(channel.provider) && channel.status === 'connected' && channel.metadata?.origem !== 'auth',
  )
}

export function activationSteps(snapshot: ActivationSnapshot): ActivationStep[] {
  const welcomeReady = Boolean(snapshot.welcomeMessage?.trim()) || snapshot.aiAutonomousReply
  return [
    {
      id: 'whatsapp',
      title: 'Conectar o WhatsApp',
      outcome: 'Receba e responda as mensagens dos seus clientes aqui.',
      duration: 'cerca de 15 min',
      done: hasOfficialWhatsApp(snapshot.channels),
      action: { label: 'Conectar', page: 'whatsapp-channel' },
    },
    {
      id: 'equipe',
      title: 'Convidar sua equipe',
      outcome: 'Cada atendente com o próprio acesso, e as conversas divididas entre eles.',
      duration: 'cerca de 1 min',
      done: snapshot.activeUsers > 1,
      action: { label: 'Convidar', page: 'users' },
    },
    {
      id: 'contatos',
      title: 'Trazer seus contatos',
      outcome: 'Quem escreve no WhatsApp já entra na base; sua carteira fica num lugar só.',
      duration: 'automático com o WhatsApp',
      done: snapshot.contacts > 0,
      action: { label: 'Ver contatos', page: 'contacts' },
    },
    {
      id: 'boas-vindas',
      title: 'Criar a mensagem de boas-vindas',
      outcome: 'Cumprimente quem chama pela primeira vez e pergunte o que a pessoa precisa.',
      duration: 'cerca de 3 min',
      done: welcomeReady,
      action: { label: 'Escrever', page: 'chat-settings' },
    },
  ]
}

export function activationProgress(steps: ActivationStep[]) {
  const done = steps.filter((step) => step.done).length
  return { done, total: steps.length, complete: done === steps.length }
}

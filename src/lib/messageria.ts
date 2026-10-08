import { api } from './crm'

/**
 * Ponte do CRM com a Messageria (sms.avilaops.com), que é quem fala com a Meta.
 *
 * As rotas existiam no backend sem tela nenhuma: ligar o CRM exigia `curl` com
 * cookie de sessão. O status bate na Messageria a cada leitura — dizer
 * "conectado" só porque há linha no banco foi o que fez a Central de
 * Integrações mentir por semanas.
 */

export type MessageriaChannel = { id: string; numero?: string | null; padrao?: boolean; teste?: boolean }

export type MessageriaStatus =
  | { connected: false }
  | {
      connected: true
      baseUrl: string
      canalId: string | null
      assinaturaRegistrada?: boolean
      canais?: MessageriaChannel[]
      /** A chave existe, mas a Messageria não respondeu ou recusou. */
      erro?: string
    }

export function getMessageriaStatus() {
  return api<MessageriaStatus>('/api/integrations/messageria/status')
}

export function connectMessageria(input: { apiKey: string; baseUrl?: string; canalId?: string }) {
  return api<{ ok: boolean; canalId: string | null; canais: MessageriaChannel[] }>('/api/integrations/messageria/connect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function disconnectMessageria() {
  return api<{ ok: boolean }>('/api/integrations/messageria/disconnect', { method: 'POST' })
}

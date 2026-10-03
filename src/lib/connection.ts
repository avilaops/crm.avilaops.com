/**
 * Estados de uma conexão com serviço externo (canal ou integração).
 *
 * Um vocabulário só para a Central de integrações e para cada canal: antes cada
 * cartão inventava o seu ("Ativo", "Instalado", "Conectado"), e um deles dizia
 * "Ativo" para qualquer valor — inclusive sem nada configurado.
 */
export type ConnectionState =
  | 'draft'
  | 'pending'
  | 'syncing'
  | 'connected'
  | 'degraded'
  | 'expired'
  | 'error'
  | 'disconnected'
  | 'soon'

export type Tone = 'success' | 'warning' | 'danger' | 'neutral' | 'info'

export const connectionStates: Record<ConnectionState, { label: string; tone: Tone }> = {
  draft: { label: 'Não concluída', tone: 'warning' },
  pending: { label: 'Aguardando confirmação', tone: 'info' },
  syncing: { label: 'Sincronizando', tone: 'info' },
  connected: { label: 'Conectado', tone: 'success' },
  degraded: { label: 'Com restrição', tone: 'warning' },
  expired: { label: 'Reconecte', tone: 'danger' },
  error: { label: 'Com erro', tone: 'danger' },
  disconnected: { label: 'Não conectado', tone: 'neutral' },
  soon: { label: 'Em breve', tone: 'neutral' },
}

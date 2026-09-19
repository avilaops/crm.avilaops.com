import { useEffect, useRef, useState } from 'react'

/**
 * Assinatura do fluxo de eventos do servidor.
 *
 * O EventSource ja reconecta sozinho com o intervalo que o backend manda no
 * `retry:` — nao ha backoff escrito aqui de proposito. O que falta no padrao e
 * saber se a conexao esta de pe: sem isso o atendente nao tem como distinguir
 * "nenhuma mensagem nova" de "a pagina parou de receber".
 */

export type RealtimeEventType = 'conversation.updated' | 'conversation.read' | 'message.created' | 'message.updated'

export type RealtimeEvent = {
  type: RealtimeEventType
  tenantId: string
  conversationId?: string | null
  data?: Record<string, unknown> | null
  /** O evento nao coube no transporte: busque o dado pela API antes de usar. */
  truncated?: boolean
}

const EVENT_TYPES: RealtimeEventType[] = ['conversation.updated', 'conversation.read', 'message.created', 'message.updated']

export function useRealtime(onEvent: (event: RealtimeEvent) => void) {
  const [connected, setConnected] = useState(false)
  // O handler muda a cada render (fecha sobre o estado do inbox); guardar numa
  // ref evita derrubar e reabrir o SSE a cada tecla digitada na busca.
  const handler = useRef(onEvent)
  handler.current = onEvent

  useEffect(() => {
    const source = new EventSource('/api/realtime', { withCredentials: true })

    const dispatch = (event: MessageEvent<string>) => {
      try {
        handler.current(JSON.parse(event.data) as RealtimeEvent)
      } catch {
        // Um evento malformado nao pode derrubar a assinatura inteira.
      }
    }

    source.addEventListener('ready', () => setConnected(true))
    for (const type of EVENT_TYPES) source.addEventListener(type, dispatch as EventListener)
    source.onerror = () => setConnected(false)

    return () => {
      source.close()
      setConnected(false)
    }
  }, [])

  return { connected }
}

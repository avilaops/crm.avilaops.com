import { useSyncExternalStore } from 'react'

/** Largura a partir da qual lista e detalhe aparecem lado a lado (840px). */
export const EXPANDED_QUERY = '(min-width: 52.5rem)'

/**
 * Responde a uma media query e acompanha mudanças (girar o tablet, redimensionar).
 *
 * O layout em si é decidido no CSS; isto existe para o comportamento que o CSS
 * não alcança — por exemplo, não abrir sozinha uma conversa que, no celular,
 * ficaria escondida atrás da lista e seria marcada como lida sem ninguém ver.
 */
export function useMediaQuery(query: string) {
  return useSyncExternalStore(
    (onChange) => {
      const media = window.matchMedia(query)
      media.addEventListener('change', onChange)
      return () => media.removeEventListener('change', onChange)
    },
    () => window.matchMedia(query).matches,
    () => false,
  )
}

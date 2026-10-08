import { createContext, useContext } from 'react'
import type { Page, Route } from '../types'

export type Navigation = {
  route: Route
  navigate: (next: Route | Page) => void
}

export const NavigationContext = createContext<Navigation | null>(null)

/** Rota atual e como trocar de tela, sem passar `setPage` de mão em mão. */
export function useNavigation(): Navigation {
  const navigation = useContext(NavigationContext)
  if (!navigation) throw new Error('useNavigation fora do NavigationContext.')
  return navigation
}

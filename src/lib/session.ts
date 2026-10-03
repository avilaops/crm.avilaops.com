import { createContext, useContext } from 'react'
import type { SessionUser } from './auth'

/**
 * Quem está usando o CRM agora.
 *
 * Antes cada tela desenhava o próprio usuário — o menu e o perfil mostravam um
 * nome e um e-mail escritos à mão, os mesmos para qualquer pessoa que entrasse.
 * O dado vem da sessão, uma vez, e desce por contexto.
 */
export type Session = {
  user: SessionUser
  /** Administrador ou gerente: mesma regra do `canManage` do servidor. */
  canManage: boolean
  signOut: () => void
  /** Depois de editar o próprio perfil: menu e cabeçalho mudam na hora. */
  updateUser: (user: SessionUser) => void
}

export const SessionContext = createContext<Session | null>(null)

export function useSession(): Session {
  const session = useContext(SessionContext)
  if (!session) throw new Error('useSession fora do SessionContext.')
  return session
}

export function canManageRole(role: string | null | undefined) {
  return role === 'admin' || role === 'gerente' || role === 'manager'
}

export function roleLabel(role: string | null | undefined) {
  if (role === 'admin') return 'Administrador'
  if (role === 'gerente' || role === 'manager') return 'Gerente'
  return 'Atendente'
}

export function initials(name: string | null | undefined) {
  const parts = (name ?? '').trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  const first = parts[0][0] ?? ''
  const last = parts.length > 1 ? parts[parts.length - 1][0] ?? '' : ''
  return `${first}${last}`.toUpperCase()
}

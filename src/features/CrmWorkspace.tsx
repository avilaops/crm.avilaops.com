import { useCallback, useMemo, type ReactNode } from 'react'
import AppShell from '../components/layout/AppShell'
import Copilot from '../components/layout/Copilot'
import PublicMdxPage from '../components/public/PublicMdxPage'
import { useSessionState } from '../components/crm/SessionState'
import { NavigationContext } from '../lib/navigationContext'
import { canManageRole, SessionContext } from '../lib/session'
import { isSettingsPage } from '../routes'
import type { Page, Route } from '../types'
export type { Page } from '../types'

type CrmWorkspaceProps = {
  route: Route
  navigate: (next: Route | Page) => void
  children: ReactNode
}

function CrmWorkspace({ route, navigate, children }: CrmWorkspaceProps) {
  const { user, setUser, checking } = useSessionState()

  const signOut = useCallback(() => {
    // Espera o servidor encerrar a sessão antes de mostrar a entrada: a tela de
    // landing confere a sessão ao abrir e, com o cookie ainda vivo, devolveria a
    // pessoa para dentro do CRM sem ela pedir.
    window.location.assign('/api/auth/logout/central')
  }, [])

  const session = useMemo(
    () => (user ? { user, canManage: canManageRole(user.role), signOut, updateUser: setUser } : null),
    [user, signOut],
  )
  const navigation = useMemo(() => ({ route, navigate }), [route, navigate])

  if (checking) return <main className="grid min-h-dvh place-items-center" role="status">Carregando o CRM…</main>

  if (!session) {
    return <PublicMdxPage path="/" onEnter={setUser} />
  }

  const inSettings = isSettingsPage(route.page)

  return (
    <SessionContext.Provider value={session}>
      <NavigationContext.Provider value={navigation}>
        <AppShell aside={inSettings || route.page === 'chat-inbox' ? null : <Copilot />}>
          {children}
        </AppShell>
      </NavigationContext.Provider>
    </SessionContext.Provider>
  )
}

export default CrmWorkspace

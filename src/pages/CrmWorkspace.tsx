import { useCallback, useMemo, useState } from 'react'
import AppShell from '../components/layout/AppShell'
import Copilot from '../components/layout/Copilot'
import Login from '../components/layout/Login'
import { logout, type SessionUser } from '../lib/auth'
import { NavigationContext } from '../lib/navigationContext'
import { canManageRole, SessionContext } from '../lib/session'
import { isSettingsPage } from '../routes'
import type { Page, Route } from '../types'
import SettingsShell from './settings/SettingsPages'
import Workspace from './workspace/WorkspacePages'
export type { Page } from '../types'

type CrmWorkspaceProps = {
  route: Route
  navigate: (next: Route | Page) => void
}

function CrmWorkspace({ route, navigate }: CrmWorkspaceProps) {
  const [user, setUser] = useState<SessionUser | null>(null)

  const signOut = useCallback(() => {
    // Espera o servidor encerrar a sessão antes de mostrar a entrada: a tela de
    // login confere a sessão ao abrir e, com o cookie ainda vivo, devolveria a
    // pessoa para dentro do CRM sem ela pedir.
    logout()
      .catch(() => undefined)
      .finally(() => setUser(null))
  }, [])

  const session = useMemo(
    () => (user ? { user, canManage: canManageRole(user.role), signOut, updateUser: setUser } : null),
    [user, signOut],
  )
  const navigation = useMemo(() => ({ route, navigate }), [route, navigate])

  if (!session) {
    return <Login onEnter={setUser} />
  }

  const inSettings = isSettingsPage(route.page)

  return (
    <SessionContext.Provider value={session}>
      <NavigationContext.Provider value={navigation}>
        <AppShell aside={inSettings || route.page === 'chat-inbox' ? null : <Copilot />}>
          {inSettings ? <SettingsShell /> : <Workspace />}
        </AppShell>
      </NavigationContext.Provider>
    </SessionContext.Provider>
  )
}

export default CrmWorkspace

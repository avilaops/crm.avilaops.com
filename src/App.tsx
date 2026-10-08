import { useCallback, useEffect, useState } from 'react'
import CrmWorkspace from './pages/CrmWorkspace'
import { hashFor, hashFromPathname, parseHash } from './routes'
import type { Page, Route } from './types'

const basePath = import.meta.env.BASE_URL

/** Troca o endereço sem criar entrada no histórico (redirecionamento). */
function replaceHash(route: Route) {
  window.history.replaceState(window.history.state, '', `${basePath}${hashFor(route)}`)
}

function readRoute(): Route {
  // Caminho sem hash (link colado, favorito antigo): vira hash na raiz do app.
  const fromPathname = window.location.hash ? null : hashFromPathname(window.location.pathname, basePath)
  const resolved = parseHash(fromPathname ?? window.location.hash)
  // `/mail/inbox/#/communications/inbox/` era o rastro do menu antigo, que
  // trocava o hash sem tirar o caminho: a barra volta para a raiz do app.
  const strayPathname = window.location.pathname !== basePath
  if (fromPathname || resolved.redirected || strayPathname) replaceHash(resolved.route)
  return resolved.route
}

function App() {
  const [route, setRoute] = useState<Route>(readRoute)

  useEffect(() => {
    const handleHashChange = () => setRoute(readRoute())
    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const navigate = useCallback((next: Route | Page) => {
    const nextRoute = typeof next === 'string' ? { page: next } : next
    const nextHash = hashFor(nextRoute)
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
      return
    }
    setRoute(nextRoute)
  }, [])

  return <CrmWorkspace route={route} navigate={navigate} />
}

export default App

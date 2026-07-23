import { useEffect, useState } from 'react'
import CrmWorkspace, { type Page } from './pages/CrmWorkspace'
import { getHashForPage, getPageFromHash } from './routes'

function App() {
  const [page, setPage] = useState<Page>(() => getPageFromHash(window.location.hash))

  useEffect(() => {
    const handleHashChange = () => {
      setPage(getPageFromHash(window.location.hash))
    }

    window.addEventListener('hashchange', handleHashChange)
    return () => window.removeEventListener('hashchange', handleHashChange)
  }, [])

  const handlePageChange = (nextPage: Page) => {
    const nextHash = getHashForPage(nextPage)
    if (window.location.hash !== nextHash) {
      window.location.hash = nextHash
      return
    }

    setPage(nextPage)
  }

  return <CrmWorkspace initialPage={page} onPageChange={handlePageChange} />
}

export default App

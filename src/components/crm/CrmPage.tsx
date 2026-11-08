'use client'

import { usePathname, useRouter } from 'next/navigation'
import { useCallback, useEffect, type ReactNode } from 'react'
import { pathFor } from '../../routes'
import { resolveNextLocation } from '../../lib/nextRoutes'
import { clearLegacySecrets } from '../../lib/legacyStorage'
import type { Page, Route } from '../../types'
import CrmWorkspace from '../../features/CrmWorkspace'

export default function CrmPage({ page, children }: { page: Page; children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const resolved = resolveNextLocation(pathname ?? '/', '')
  const route: Route = { page, param: resolved.route.param }

  useEffect(() => {
    clearLegacySecrets()
    const migrateHash = () => {
      if (window.location.hash.startsWith('#/')) {
        router.replace(resolveNextLocation(window.location.pathname, window.location.hash).path)
      }
    }
    migrateHash()
    window.addEventListener('hashchange', migrateHash)
    return () => window.removeEventListener('hashchange', migrateHash)
  }, [router])

  const navigate = useCallback((next: Route | Page) => router.push(pathFor(next)), [router])
  return <CrmWorkspace route={route} navigate={navigate}>{children}</CrmWorkspace>
}

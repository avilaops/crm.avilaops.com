import { MDXProvider } from '@mdx-js/react'
import { useEffect, useState } from 'react'
import LandingDocument from '../../content/public/landing.mdx'
import DocsDocument from '../../content/public/docs.mdx'
import PrivacyDocument from '../../content/public/privacidade.mdx'
import TermsDocument from '../../content/public/termos.mdx'
import { getSession, getSsoStatus, type SessionUser } from '../../lib/auth'
import { PublicMdxComponents, PublicMdxLayout } from './PublicMdxLayout'

type PublicMdxPageProps = {
  path: '/' | '/docs/' | '/privacidade/' | '/termos/'
  onEnter?: (user: SessionUser) => void
}

const documents = {
  '/docs/': DocsDocument,
  '/privacidade/': PrivacyDocument,
  '/termos/': TermsDocument,
} as const

export default function PublicMdxPage({ path, onEnter }: PublicMdxPageProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [signupUrl, setSignupUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(path === '/')
  const Document = path === '/' ? LandingDocument : documents[path]

  useEffect(() => {
    let active = true
    getSsoStatus()
      .then((status) => {
        if (!active) return
        setAuthUrl(status.enabled ? status.url : null)
        setSignupUrl(status.enabled ? status.signupUrl : null)
      })
      .catch(() => undefined)
      .finally(() => active && setChecking(false))
    if (path === '/' && onEnter) {
      getSession().then((session) => {
        if (active && session.user) onEnter(session.user)
      }).catch(() => undefined)
    }
    return () => { active = false }
  }, [onEnter, path])

  return (
    <PublicMdxLayout authUrl={authUrl} signupUrl={signupUrl}>
      <MDXProvider components={PublicMdxComponents()}>
        <Document authUrl={authUrl} signupUrl={signupUrl} checking={checking} />
      </MDXProvider>
    </PublicMdxLayout>
  )
}

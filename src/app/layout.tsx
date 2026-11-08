import type { Metadata, Viewport } from 'next'
import type { ReactNode } from 'react'
import { SessionStateProvider } from '../components/crm/SessionState'
import { AnimatedSidebarProvider } from '../components/ui/animated-sidebar'
import '../index.css'

export const metadata: Metadata = {
  title: 'Avila CRM | Avila Ops',
  description: 'Conversas, oportunidades e clientes em um espaço de trabalho da Ávila Ops.',
  icons: { icon: '/avila-crm-symbol.svg' },
  manifest: '/site.webmanifest',
  robots: { index: false, follow: false },
  openGraph: {
    title: 'Avila CRM | Avila Ops',
    siteName: 'Avila Ops',
    locale: 'pt_BR',
    type: 'website',
    images: [{ url: 'https://crm.avilaops.com/og-default.png', width: 1200, height: 630 }],
  },
  twitter: { card: 'summary_large_image', images: ['https://crm.avilaops.com/og-default.png'] },
}

export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0b0d10' }

export default function RootLayout({ children }: { children: ReactNode }) {
  return <html lang="pt-BR"><body><AnimatedSidebarProvider><SessionStateProvider>{children}</SessionStateProvider></AnimatedSidebarProvider></body></html>
}

import { ArrowUpRight, Check, Circle } from 'lucide-react'
import { type ReactNode } from 'react'
import AvilaMark from '../layout/AvilaMark'

export type PublicMdxLayoutProps = {
  children: ReactNode
  authUrl?: string | null
  signupUrl?: string | null
}

export function PublicMdxLayout({ children, authUrl, signupUrl }: PublicMdxLayoutProps) {
  return (
    <main className="public-mdx min-h-dvh overflow-hidden bg-[#101312] text-[#f4f1e8]">
      <div className="public-mdx-grid pointer-events-none fixed inset-0 -z-0 opacity-70" />
      <nav className="relative z-10 mx-auto flex max-w-7xl items-center justify-between px-6 py-5 lg:px-10">
        <a href="/" className="flex items-center gap-3" aria-label="Avila CRM, início">
          <AvilaMark />
          <span className="leading-none">
            <span className="block text-sm font-bold tracking-[0.16em] text-white">AVILA CRM</span>
            <span className="mt-1 block text-[10px] font-medium tracking-[0.14em] text-[#aab5ae]">AVILA OPS</span>
          </span>
        </a>
        <div className="hidden items-center gap-7 text-sm text-[#b7c0ba] md:flex">
          <a href="/docs/" className="transition-colors hover:text-white">Documentação</a>
          <a href="/#produto" className="transition-colors hover:text-white">Produto</a>
          {authUrl && <a href={authUrl} className="font-semibold text-white transition-colors hover:text-[#f6c945]">Entrar</a>}
          {signupUrl && <a href={signupUrl} className="rounded-lg border border-[#68756d] px-3 py-2 font-semibold text-white transition-colors hover:border-[#f6c945] hover:text-[#f6c945]">Criar conta</a>}
        </div>
      </nav>

      <div className="relative z-10">{children}</div>

      <footer className="relative z-10 mx-auto mt-20 flex max-w-7xl flex-col gap-4 border-t border-white/10 px-6 py-8 text-xs text-[#87938b] sm:flex-row sm:items-center sm:justify-between lg:px-10">
        <span>Avila CRM · Avila Ops</span>
        <div className="flex gap-5">
          <a href="/docs/" className="hover:text-white">Documentação</a>
          <a href="/privacidade/" className="hover:text-white">Privacidade</a>
          <a href="/termos/" className="hover:text-white">Termos</a>
        </div>
      </footer>
    </main>
  )
}

export function PublicMdxComponents() {
  return {
    h1: ({ children }: { children?: ReactNode }) => <h1 className="public-mdx-heading">{children}</h1>,
    h2: ({ children }: { children?: ReactNode }) => <h2 className="public-mdx-h2">{children}</h2>,
    h3: ({ children }: { children?: ReactNode }) => <h3 className="public-mdx-h3">{children}</h3>,
    p: ({ children }: { children?: ReactNode }) => <p className="public-mdx-copy">{children}</p>,
    ul: ({ children }: { children?: ReactNode }) => <ul className="public-mdx-list">{children}</ul>,
    li: ({ children }: { children?: ReactNode }) => <li className="flex gap-3"><Check size={18} className="mt-1 shrink-0 text-[#f6c945]" aria-hidden="true" />{children}</li>,
    a: ({ href, children }: { href?: string; children?: ReactNode }) => <a href={href} className="text-[#77d3e8] underline decoration-[#77d3e8]/40 underline-offset-4 hover:text-white">{children}<ArrowUpRight size={14} className="ml-1 inline" aria-hidden="true" /></a>,
    hr: () => <hr className="my-12 border-white/10" />,
    Circle,
  }
}

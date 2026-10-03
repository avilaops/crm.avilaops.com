import { CircleHelp, LogOut, Menu, Settings } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { bottomBarSections, navSections, sectionOf, type NavSection } from '../../navigation'
import { isSettingsPage } from '../../routes'
import { useNavigation } from '../../lib/navigationContext'
import { initials, roleLabel, useSession } from '../../lib/session'
import { supportLinks } from '../../lib/support'
import type { Page } from '../../types'
import { Sheet } from '../ui/Sheet'

/**
 * Casca do CRM: a navegação muda de forma conforme a largura.
 *
 * - abaixo de 600px: barra inferior com Início, Conversas, Vendas, Contatos e
 *   "Mais" (o resto abre numa folha);
 * - de 600 a 1199px: trilho lateral de 72px, só ícones e rótulo curto;
 * - a partir de 1200px: menu lateral fixo, com os itens da seção aberta.
 *
 * Os três existem no HTML e quem escolhe é o CSS: girar o tablet troca a
 * navegação sem piscar e sem estado para sincronizar.
 */
export default function AppShell({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  const { route, navigate } = useNavigation()
  const [moreOpen, setMoreOpen] = useState(false)
  const current = sectionOf(route.page)
  const inSettings = isSettingsPage(route.page)
  // Dentro de uma conversa, no celular, a barra inferior sai: o espaço é do
  // campo de resposta, como nos apps de mensagem.
  const immersive = route.page === 'chat-inbox' && Boolean(route.param)

  useEffect(() => {
    document.documentElement.toggleAttribute('data-immersive', immersive)
    return () => document.documentElement.removeAttribute('data-immersive')
  }, [immersive])

  // A rolagem é do documento: sem isto, quem desce na lista de Configurações e
  // abre um item cai no meio da tela seguinte.
  const routeKey = `${route.page}:${route.param ?? ''}`
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [routeKey])

  const go = (page: Page) => {
    setMoreOpen(false)
    navigate(page)
  }

  return (
    <div className="flex min-h-dvh bg-[#f3f3f3] pl-[env(safe-area-inset-left)] pr-[env(safe-area-inset-right)] text-slate-800">
      <SideDrawer current={current} inSettings={inSettings} activePage={route.page} go={go} />
      <NavRail current={current} inSettings={inSettings} go={go} />

      <div className="min-w-0 flex-1 pb-[var(--app-bottom-nav)]">{children}</div>
      {aside}

      {!immersive && (
        <nav
          aria-label="Principal"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur medium:hidden"
        >
          <ul className="grid grid-cols-5">
            {bottomBarSections.map((id) => {
              const section = navSections.find((item) => item.id === id)
              if (!section) return null
              const Icon = section.icon
              const active = current?.id === id
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => go(section.page)}
                    aria-current={active ? 'page' : undefined}
                    className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${active ? 'text-blue-700' : 'text-slate-500'}`}
                  >
                    <span className={`grid h-7 w-12 place-items-center rounded-full ${active ? 'bg-blue-100' : ''}`}>
                      <Icon size={20} aria-hidden="true" />
                    </span>
                    {section.label}
                  </button>
                </li>
              )
            })}
            <li>
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                aria-haspopup="dialog"
                className={`flex h-16 w-full flex-col items-center justify-center gap-1 text-[11px] font-medium ${
                  !current || !bottomBarSections.includes(current.id) ? 'text-blue-700' : 'text-slate-500'
                }`}
              >
                <span className={`grid h-7 w-12 place-items-center rounded-full ${!current || !bottomBarSections.includes(current.id) ? 'bg-blue-100' : ''}`}>
                  <Menu size={20} aria-hidden="true" />
                </span>
                Mais
              </button>
            </li>
          </ul>
        </nav>
      )}

      <MoreSheet open={moreOpen} onClose={() => setMoreOpen(false)} activePage={route.page} go={go} />
    </div>
  )
}

function Brand({ compact = false }: { compact?: boolean }) {
  return compact ? (
    <span className="grid size-10 place-items-center rounded-xl bg-slate-900 text-base font-black italic text-white" aria-label="Agenda">
      A
    </span>
  ) : (
    <span className="text-2xl font-black italic text-slate-900">Agenda</span>
  )
}

function SideDrawer({
  current,
  inSettings,
  activePage,
  go,
}: {
  current: NavSection | undefined
  inSettings: boolean
  activePage: Page
  go: (page: Page) => void
}) {
  return (
    <aside className="sticky top-0 hidden h-dvh w-[248px] shrink-0 flex-col border-r border-slate-200 bg-white large:flex">
      <div className="flex h-16 shrink-0 items-center px-5">
        <Brand />
      </div>
      <nav aria-label="Principal" className="min-h-0 flex-1 overflow-y-auto px-2 pb-2 text-sm">
        <ul className="space-y-0.5">
          {navSections.map((section) => {
            const Icon = section.icon
            const open = current?.id === section.id
            return (
              <li key={section.id}>
                <button
                  type="button"
                  onClick={() => go(section.page)}
                  aria-current={open && !section.children ? 'page' : undefined}
                  aria-expanded={section.children ? open : undefined}
                  className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left font-medium transition ${
                    open ? 'text-blue-700' : 'text-slate-700 hover:bg-slate-100'
                  } ${open && !section.children ? 'bg-blue-50' : ''}`}
                >
                  <Icon size={18} aria-hidden="true" />
                  {section.label}
                </button>
                {section.children && open && (
                  <ul className="mb-1 ml-[1.35rem] border-l border-slate-200 pl-2">
                    {section.children.map((child) => {
                      const active = activePage === child.page
                      return (
                        <li key={child.page}>
                          <button
                            type="button"
                            onClick={() => go(child.page)}
                            aria-current={active ? 'page' : undefined}
                            className={`flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left transition ${
                              active ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            <span className="truncate">{child.label}</span>
                            {child.badge && (
                              <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[11px] font-semibold text-violet-700">{child.badge}</span>
                            )}
                          </button>
                        </li>
                      )
                    })}
                  </ul>
                )}
              </li>
            )
          })}
        </ul>
      </nav>
      <div className="shrink-0 border-t border-slate-200 p-2 text-sm">
        <button
          type="button"
          onClick={() => go('settings')}
          aria-current={inSettings ? 'page' : undefined}
          className={`flex min-h-11 w-full items-center gap-3 rounded-lg px-3 font-medium transition ${
            inSettings ? 'bg-blue-50 text-blue-700' : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <Settings size={18} aria-hidden="true" />
          Configurações
        </button>
        <HelpLink className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 font-medium text-slate-700 hover:bg-slate-100" />
        <UserCard go={go} />
      </div>
    </aside>
  )
}

function NavRail({
  current,
  inSettings,
  go,
}: {
  current: NavSection | undefined
  inSettings: boolean
  go: (page: Page) => void
}) {
  const { user } = useSession()
  return (
    <nav
      aria-label="Principal"
      className="sticky top-0 hidden h-dvh w-[72px] shrink-0 flex-col items-center gap-1 overflow-y-auto border-r border-slate-200 bg-white py-3 medium:flex large:hidden"
    >
      <div className="mb-2">
        <Brand compact />
      </div>
      {navSections.map((section) => {
        const Icon = section.icon
        const active = current?.id === section.id
        return (
          <button
            key={section.id}
            type="button"
            onClick={() => go(section.page)}
            aria-current={active ? 'page' : undefined}
            className={`flex min-h-14 w-[68px] shrink-0 flex-col items-center justify-center gap-1 rounded-xl text-[11px] font-medium ${
              active ? 'text-blue-700' : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <span className={`grid h-8 w-14 place-items-center rounded-full ${active ? 'bg-blue-100' : ''}`}>
              <Icon size={20} aria-hidden="true" />
            </span>
            <span className="max-w-full truncate">{section.label}</span>
          </button>
        )
      })}
      <div className="mt-auto flex flex-col items-center gap-1 pt-2">
        <button
          type="button"
          onClick={() => go('settings')}
          aria-label="Configurações"
          aria-current={inSettings ? 'page' : undefined}
          className={`grid size-12 place-items-center rounded-full ${inSettings ? 'bg-blue-100 text-blue-700' : 'text-slate-500 hover:bg-slate-100'}`}
        >
          <Settings size={20} aria-hidden="true" />
        </button>
        <button
          type="button"
          onClick={() => go('profile-settings')}
          aria-label={`Minha conta: ${user.name}`}
          className="grid size-12 place-items-center"
        >
          <span className="grid size-9 place-items-center rounded-full bg-amber-300 text-xs font-bold text-slate-900">{initials(user.name)}</span>
        </button>
      </div>
    </nav>
  )
}

function MoreSheet({ open, onClose, activePage, go }: { open: boolean; onClose: () => void; activePage: Page; go: (page: Page) => void }) {
  const others = navSections.filter((section) => !bottomBarSections.includes(section.id))
  return (
    <Sheet open={open} onClose={onClose} title="Mais">
      <div className="space-y-5">
        {others.map((section) => {
          const Icon = section.icon
          const items = section.children ?? [{ page: section.page, label: section.label }]
          return (
            <section key={section.id}>
              <h3 className="mb-1 flex items-center gap-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                <Icon size={14} aria-hidden="true" />
                {section.label}
              </h3>
              <ul>
                {items.map((item) => (
                  <li key={item.page}>
                    <button
                      type="button"
                      onClick={() => go(item.page)}
                      aria-current={activePage === item.page ? 'page' : undefined}
                      className={`flex min-h-12 w-full items-center rounded-lg px-3 text-left text-[15px] ${
                        activePage === item.page ? 'bg-blue-50 font-semibold text-blue-700' : 'text-slate-800 hover:bg-slate-50'
                      }`}
                    >
                      {item.label}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        <section className="border-t border-slate-100 pt-4">
          <button
            type="button"
            onClick={() => go('settings')}
            className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-slate-800 hover:bg-slate-50"
          >
            <Settings size={18} aria-hidden="true" />
            Configurações
          </button>
          <HelpLink className="flex min-h-12 w-full items-center gap-3 rounded-lg px-3 text-left text-[15px] text-slate-800 hover:bg-slate-50" />
          <UserCard go={go} />
        </section>
      </div>
    </Sheet>
  )
}

/** "Ajuda" só aparece quando há canal de suporte configurado no ambiente. */
function HelpLink({ className }: { className: string }) {
  const { whatsapp, email } = supportLinks('Olá! Preciso de ajuda com o Agenda CRM.')
  const href = whatsapp ?? email
  if (!href) return null
  return (
    <a className={className} href={href} target="_blank" rel="noreferrer">
      <CircleHelp size={18} aria-hidden="true" />
      Ajuda
    </a>
  )
}

function UserCard({ go }: { go: (page: Page) => void }) {
  const { user, signOut } = useSession()
  return (
    <div className="mt-1 flex items-center gap-2 rounded-lg px-1 py-1">
      <button
        type="button"
        onClick={() => go('profile-settings')}
        className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-lg px-2 text-left hover:bg-slate-100"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-full bg-amber-300 text-xs font-bold text-slate-900">{initials(user.name)}</span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-medium text-slate-900">{user.name}</span>
          <span className="block truncate text-xs text-slate-500">{roleLabel(user.role)}</span>
        </span>
      </button>
      <button
        type="button"
        onClick={signOut}
        aria-label="Sair"
        title="Sair"
        className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-800"
      >
        <LogOut size={18} aria-hidden="true" />
      </button>
    </div>
  )
}

import { sectionOf } from '../../navigation'
import { useNavigation } from '../../lib/navigationContext'

/**
 * Cabeçalho das telas do workspace.
 *
 * Vive fora de `WorkspacePages` porque as telas novas (caixa de entrada,
 * newsletter) moram em arquivos próprios: se o Topbar continuasse lá, cada
 * tela nova criaria um import circular com o arquivo que a renderiza.
 *
 * Abaixo de 1200px o menu lateral não mostra os itens de cada seção; quem faz
 * esse papel são as abas sob o título (Caixa de entrada · E-mail · Equipe).
 * O campo "Pesquisar e filtrar" e o botão de reticências que ficavam aqui não
 * faziam nada — cada tela que busca tem a própria busca.
 */
function Topbar({ title, tab, action, onAction }: { title: string; tab?: string; action?: string; onAction?: () => void }) {
  const { route, navigate } = useNavigation()
  const section = sectionOf(route.page)
  const tabs = section?.children && section.children.length > 1 ? section.children : null

  return (
    <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex min-h-14 items-center gap-3 px-4 medium:px-5 expanded:min-h-16">
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-base font-semibold text-slate-900 expanded:text-lg">{title}</h1>
          {tab && <p className="truncate text-xs text-slate-500">{tab}</p>}
        </div>
        {action && (
          <button
            type="button"
            className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white transition hover:bg-blue-700"
            onClick={onAction}
          >
            {action}
          </button>
        )}
      </div>
      {tabs && (
        <nav aria-label={section?.label} className="scroll-chips -mb-px flex px-2 large:hidden">
          {tabs.map((child) => {
            const active = child.page === route.page
            return (
              <button
                key={child.page}
                type="button"
                onClick={() => navigate(child.page)}
                aria-current={active ? 'page' : undefined}
                className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-sm font-medium transition ${
                  active ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                {child.label}
                {child.badge && <span className="rounded bg-violet-100 px-1.5 text-[11px] font-semibold text-violet-700">{child.badge}</span>}
              </button>
            )
          })}
        </nav>
      )}
    </header>
  )
}

export default Topbar

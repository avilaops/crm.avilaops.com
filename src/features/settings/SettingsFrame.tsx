import { ChevronLeft, Lock } from 'lucide-react'
import type { ReactNode } from 'react'
import { EmptyState } from '../../components/ui/Rows'
import { pageLabel, settingsChildren } from '../../navigation'
import { useNavigation } from '../../lib/navigationContext'
import type { SettingsPage } from '../../types'

/**
 * Moldura de uma tela de Configurações: cabeçalho fixo com Voltar e o conteúdo
 * numa coluna de leitura.
 *
 * No celular o Voltar leva à lista ("‹ Configurações"); no computador a lista
 * já está ao lado e ele some. Nas telas de terceiro nível (Canais › WhatsApp)
 * ele aparece em qualquer largura, porque a lista não mostra esse nível.
 */
export function SettingsFrame({
  page,
  title,
  description,
  actions,
  wide = false,
  children,
}: {
  page: SettingsPage
  title: string
  description?: string
  actions?: ReactNode
  /** Tabelas e catálogos usam a largura toda; formulários ficam em 720px. */
  wide?: boolean
  children: ReactNode
}) {
  const { navigate } = useNavigation()
  const parent = settingsChildren[page]?.parent
  const back = parent ? { page: parent, label: pageLabel(parent), compactOnly: false } : { page: 'settings' as const, label: 'Configurações', compactOnly: true }

  return (
    <div className="min-w-0">
      <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="flex min-h-14 items-center gap-2 px-1 expanded:min-h-16 expanded:px-6">
          <button
            type="button"
            onClick={() => navigate(back.page)}
            className={`inline-flex min-h-11 shrink-0 items-center rounded-lg pl-1 pr-2 text-sm font-medium text-blue-700 hover:bg-blue-50 ${back.compactOnly ? 'expanded:hidden' : 'expanded:-ml-2'}`}
          >
            <ChevronLeft size={20} aria-hidden="true" />
            {back.label}
          </button>
          <span className="h-5 w-px shrink-0 bg-slate-200 expanded:hidden" aria-hidden="true" />
          <h1 className="min-w-0 flex-1 truncate text-base font-semibold text-slate-900 expanded:text-lg">{title}</h1>
          {actions}
        </div>
      </header>
      <div className={`mx-auto px-4 py-5 medium:px-6 medium:py-6 ${wide ? 'max-w-5xl' : 'max-w-[720px]'}`}>
        {description && <p className="mb-5 text-sm leading-relaxed text-slate-600">{description}</p>}
        {children}
      </div>
    </div>
  )
}

/** Atendente que abre o link de uma configuração da área de trabalho. */
export function NoPermission({ page }: { page: SettingsPage }) {
  return (
    <SettingsFrame page={page} title={pageLabel(page)}>
      <EmptyState
        icon={Lock}
        title="Só administradores e gerentes"
        description="Esta configuração vale para a empresa inteira. Peça a quem administra a conta para fazer a alteração."
      />
    </SettingsFrame>
  )
}

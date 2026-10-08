import { ChevronRight, type LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Linha de lista navegável (Configurações, Canais): ícone, título, uma linha de
 * explicação e a seta. 56px de altura, a linha inteira é o alvo do toque.
 */
export function NavRow({
  icon: Icon,
  title,
  description,
  active = false,
  trailing,
  onClick,
  disabled = false,
}: {
  icon?: LucideIcon
  title: string
  description?: string
  active?: boolean
  trailing?: ReactNode
  onClick?: () => void
  disabled?: boolean
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-current={active ? 'page' : undefined}
      className={`flex min-h-14 w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition disabled:cursor-default ${
        active ? 'bg-blue-50 text-blue-800' : 'text-slate-800 hover:bg-slate-50 disabled:hover:bg-transparent'
      }`}
    >
      {Icon && (
        <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${active ? 'bg-blue-100 text-blue-700' : 'bg-slate-100 text-slate-600'}`}>
          <Icon size={18} aria-hidden="true" />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block text-[15px] font-medium leading-snug">{title}</span>
        {description && <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">{description}</span>}
      </span>
      {trailing}
      {!disabled && <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />}
    </button>
  )
}

/** Lista vazia: o que aparece aqui, por que está vazia e o que fazer. */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
}: {
  icon: LucideIcon
  title: string
  description: string
  action?: ReactNode
}) {
  return (
    <div className="grid justify-items-center gap-3 px-4 py-10 text-center">
      <span className="grid size-12 place-items-center rounded-full bg-slate-100 text-slate-500">
        <Icon size={22} aria-hidden="true" />
      </span>
      <div className="max-w-sm">
        <p className="font-semibold text-slate-900">{title}</p>
        <p className="mt-1 text-sm leading-relaxed text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  )
}

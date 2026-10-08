import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react'
import type { ReactNode } from 'react'
import type { Tone } from '../../lib/connection'

/**
 * Campo com rótulo em cima.
 *
 * Rótulo ao lado do campo (grade de 120px + campo) era o que, num celular de
 * 390px, sobrava 20px para digitar. Em cima, o campo ocupa a largura toda em
 * qualquer tela. O `<label>` envolve o campo, então tocar no texto foca nele.
 */
export function FormField({
  label,
  hint,
  error,
  className = '',
  children,
}: {
  label: string
  hint?: ReactNode
  error?: string | null
  className?: string
  children: ReactNode
}) {
  return (
    <label className={`grid min-w-0 content-start gap-1.5 ${className}`}>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {children}
      {error ? (
        <span className="text-xs text-red-600" role="alert">{error}</span>
      ) : (
        hint && <span className="text-xs leading-relaxed text-slate-500">{hint}</span>
      )}
    </label>
  )
}

/** Bloco de formulário: título curto, explicação de uma linha e os campos. */
export function FormSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4 medium:p-6">
      <h3 className="text-base font-semibold text-slate-900">{title}</h3>
      {description && <p className="mt-1 text-sm text-slate-500">{description}</p>}
      <div className="mt-4 grid gap-4">{children}</div>
    </section>
  )
}

/**
 * Barra de salvar fixa no rodapé, que só aparece quando há alteração.
 *
 * Fica acima da barra de navegação do celular (`--app-bottom-nav`) e acompanha
 * a rolagem: o formulário pode ser longo, e o botão no fim da página obrigava a
 * rolar tudo para descobrir se tinha salvado.
 */
export function StickyActionBar({ visible, children }: { visible: boolean; children: ReactNode }) {
  if (!visible) return null
  return (
    <div className="sticky bottom-[var(--app-bottom-nav)] z-20 -mx-4 mt-6 flex items-center justify-end gap-2 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur medium:-mx-6 medium:px-6 medium:pb-[calc(0.75rem+env(safe-area-inset-bottom))]">
      {children}
    </div>
  )
}

const noticeStyles: Record<Tone, { box: string; icon: typeof Info }> = {
  success: { box: 'border-emerald-200 bg-emerald-50 text-emerald-800', icon: CheckCircle2 },
  warning: { box: 'border-amber-200 bg-amber-50 text-amber-900', icon: AlertTriangle },
  danger: { box: 'border-red-200 bg-red-50 text-red-700', icon: XCircle },
  info: { box: 'border-blue-200 bg-blue-50 text-blue-800', icon: Info },
  neutral: { box: 'border-slate-200 bg-slate-50 text-slate-700', icon: Info },
}

/** Aviso em linha. Erro e sucesso são anunciados ao leitor de tela. */
export function Notice({ tone, children, action }: { tone: Tone; children: ReactNode; action?: ReactNode }) {
  const style = noticeStyles[tone]
  const Icon = style.icon
  return (
    <div
      className={`flex items-start gap-3 rounded-lg border px-4 py-3 text-sm ${style.box}`}
      role={tone === 'danger' ? 'alert' : 'status'}
    >
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 leading-relaxed">{children}</div>
      {action}
    </div>
  )
}

/**
 * Liga/desliga com título e explicação. A linha inteira é clicável e o
 * checkbox de verdade continua ali (escondido), então teclado e leitor de tela
 * funcionam sem nada a mais.
 */
export function ToggleRow({
  checked,
  onChange,
  title,
  description,
}: {
  checked: boolean
  onChange: (checked: boolean) => void
  title: string
  description?: string
}) {
  return (
    <label className="flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 transition hover:bg-slate-50">
      <input type="checkbox" className="peer sr-only" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span
        aria-hidden="true"
        className="relative mt-0.5 h-6 w-10 shrink-0 rounded-full bg-slate-300 transition after:absolute after:left-0.5 after:top-0.5 after:size-5 after:rounded-full after:bg-white after:shadow after:transition peer-checked:bg-blue-600 peer-checked:after:translate-x-4 peer-focus-visible:outline-2 peer-focus-visible:outline-offset-2 peer-focus-visible:outline-blue-600"
      />
      <span className="min-w-0">
        <span className="block text-sm font-medium text-slate-900">{title}</span>
        {description && <span className="mt-0.5 block text-sm leading-snug text-slate-500">{description}</span>}
      </span>
    </label>
  )
}

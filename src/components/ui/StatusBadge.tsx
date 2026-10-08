import { connectionStates, type ConnectionState, type Tone } from '../../lib/connection'

const toneClasses: Record<Tone, { badge: string; dot: string }> = {
  success: { badge: 'bg-emerald-50 text-emerald-800 ring-emerald-200', dot: 'bg-emerald-500' },
  warning: { badge: 'bg-amber-50 text-amber-800 ring-amber-200', dot: 'bg-amber-500' },
  danger: { badge: 'bg-red-50 text-red-700 ring-red-200', dot: 'bg-red-500' },
  neutral: { badge: 'bg-slate-100 text-slate-600 ring-slate-200', dot: 'bg-slate-400' },
  info: { badge: 'bg-blue-50 text-blue-700 ring-blue-200', dot: 'bg-blue-500' },
}

/** Selo de estado: cor e texto juntos, para não depender só da cor. */
export function StatusBadge({ state, label }: { state: ConnectionState; label?: string }) {
  const meta = connectionStates[state]
  const tone = toneClasses[meta.tone]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset ${tone.badge}`}>
      <span className={`size-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
      {label ?? meta.label}
    </span>
  )
}

export function ToneBadge({ tone, children }: { tone: Tone; children: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[11px] font-semibold ring-1 ring-inset ${toneClasses[tone].badge}`}>
      {children}
    </span>
  )
}

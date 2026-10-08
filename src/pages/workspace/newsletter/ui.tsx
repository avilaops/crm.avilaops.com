import type { ReactNode } from 'react'
import { STATUS_LABEL } from './labels'

export function Chip({ active, children, onClick }: { active: boolean; children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`rounded-full border px-3 py-1 text-xs ${active ? 'border-blue-500 bg-blue-50 font-medium text-blue-700' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

export function Field({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  type?: string
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
      <input
        className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
        type={type}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  )
}

export function StatusBadge({ status }: { status: string }) {
  const cor =
    status === 'sent' || status === 'subscribed'
      ? 'bg-emerald-50 text-emerald-700'
      : status === 'failed' || status === 'unsubscribed'
        ? 'bg-red-50 text-red-700'
        : status === 'sending' || status === 'pending'
          ? 'bg-amber-50 text-amber-700'
          : 'bg-slate-100 text-slate-600'
  return <span className={`rounded px-2 py-1 text-xs ${cor}`}>{STATUS_LABEL[status] ?? status}</span>
}

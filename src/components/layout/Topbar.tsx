import { MoreHorizontal, Search } from 'lucide-react'

/**
 * Cabeçalho das telas do workspace.
 *
 * Vive fora de `WorkspacePages` porque as telas novas (caixa de entrada,
 * newsletter) moram em arquivos próprios: se o Topbar continuasse lá, cada
 * tela nova criaria um import circular com o arquivo que a renderiza.
 */
function Topbar({ title, tab, action, onAction }: { title: string; tab?: string; action?: string; onAction?: () => void }) {
  return (
    <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-5">
      <h2 className="min-w-32 text-base font-bold uppercase tracking-wide">{title}</h2>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        <input className="w-full rounded border-0 py-2 pl-9 text-sm outline-none" placeholder="Pesquisar e filtrar" />
      </div>
      {tab && <span className="rounded bg-lime-100 px-2 py-1 text-sm text-lime-700">{tab}</span>}
      <button className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold">
        <MoreHorizontal size={16} />
      </button>
      {action && (
        <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700" onClick={onAction}>
          {action}
        </button>
      )}
    </header>
  )
}

export default Topbar

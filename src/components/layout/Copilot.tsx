import { ChevronRight, Send, Sparkles, X } from 'lucide-react'

function Copilot() {
  return (
    <aside className="sticky top-0 hidden h-dvh w-80 shrink-0 flex-col border-l border-slate-200 bg-white xl:flex">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <h2 className="font-medium"><Sparkles className="mr-2 inline text-violet-500" size={16} />Agenda Copilot</h2>
        <X size={16} />
      </div>
      <button className="border-b border-slate-100 px-5 py-4 text-left text-sm">Novo chat <ChevronRight className="float-right" size={16} /></button>
      <div className="flex-1 p-5 text-center">
        <div className="mx-auto mt-16 grid h-10 w-10 place-items-center rounded bg-violet-100 text-violet-600"><Sparkles size={18} /></div>
        <h3 className="mt-5 font-semibold">Modo Ajuda</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Pergunte-me qualquer coisa sobre sua base de conhecimentos. Eu encontrarei as respostas para você.</p>
      </div>
      <div className="border-t border-slate-200 p-4">
        <select className="input mb-3"><option>Modo Ajuda</option></select>
        <textarea className="input min-h-20 resize-none" placeholder="Pergunte ao Agenda Copilot" />
        <button className="mt-2 w-full rounded bg-slate-950 px-3 py-2 text-sm text-white"><Send className="mr-2 inline" size={14} />Enviar</button>
        <p className="mt-3 text-center text-xs text-slate-400">O conteúdo gerado por IA pode ser impreciso</p>
      </div>
    </aside>
  )
}

export default Copilot


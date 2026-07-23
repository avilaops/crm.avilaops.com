import { MessageCircle, X } from 'lucide-react'

function WhatsAppModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded bg-white shadow-xl">
        <aside className="bg-slate-50 p-8">
          <div className="grid h-32 place-items-center rounded bg-emerald-950 text-xl font-bold text-white">WhatsApp Business</div>
          <h3 className="mt-5 text-2xl font-bold">WhatsApp Business</h3>
          <p className="mt-2 text-sm text-slate-500">Mais leads com poderosas ferramentas do WhatsApp.</p>
          <span className="mt-5 inline-block rounded border border-emerald-500 px-4 py-2 text-emerald-600">Instalado</span>
        </aside>
        <section className="relative p-10">
          <button className="absolute right-4 top-4" onClick={onClose}><X size={18} /></button>
          <div className="grid h-28 w-28 place-items-center rounded-full bg-emerald-100 text-emerald-600"><MessageCircle size={48} /></div>
          <h2 className="mt-8 text-2xl">Conecte o WhatsApp à sua conta Agenda</h2>
          <p className="mt-3 max-w-xl text-slate-500">Vincule sua conta WhatsApp existente ou crie uma nova com um número de telefone. Para vários números, repita o processo por canal.</p>
          <div className="mt-8 flex gap-3">
            <button className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Conectar meu WhatsApp</button>
            <button className="rounded border border-slate-200 px-5 py-2 text-sm font-semibold">Conectar número novo</button>
          </div>
          <div className="mt-8 rounded border border-slate-200 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Limites oficiais Meta</p>
            <p className="mt-1">Portfólios novos começam com 2 números registrados. O limite pode escalar até 20 números.</p>
          </div>
        </section>
      </div>
    </div>
  )
}


export default WhatsAppModal


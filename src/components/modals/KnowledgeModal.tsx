import { FileText, Link2 } from 'lucide-react'

function KnowledgeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      <div className="w-full max-w-xl rounded bg-white p-8 shadow-xl">
        <div className="mb-6 flex justify-between">
          <h2 className="text-xl">Escolha sua primeira fonte</h2>
          <button onClick={onClose}>Cancelar</button>
        </div>
        <div className="space-y-4">
          <button className="w-full rounded border border-slate-200 p-5 text-left">
            <FileText className="mr-4 inline text-blue-500" />
            <span className="font-semibold">Modelo Agenda IA</span>
            <p className="mt-2 text-sm text-slate-500">Use modelos pré-configurados para perguntas frequentes.</p>
          </button>
          <button className="w-full rounded border border-slate-200 p-5 text-left">
            <Link2 className="mr-4 inline text-slate-500" />
            <span className="font-semibold">Conteúdo personalizado</span>
            <p className="mt-2 text-sm text-slate-500">Treine a IA com seus sites, documentos e base de conhecimento.</p>
          </button>
        </div>
      </div>
    </div>
  )
}


export default KnowledgeModal


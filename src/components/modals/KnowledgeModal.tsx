import { useState } from 'react'
import { FileText, HelpCircle, Shield, X } from 'lucide-react'
import { createKnowledgeSource, type KnowledgeSource } from '../../lib/crm'

interface KnowledgeModalProps {
  onClose: () => void
  onCreated: (source: KnowledgeSource) => void
}

export default function KnowledgeModal({ onClose, onCreated }: KnowledgeModalProps) {
  const [step, setStep] = useState<'select' | 'form'>('select')
  const [type, setType] = useState<'faq' | 'document' | 'url' | 'guideline'>('faq')
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const handleSelectType = (selectedType: 'faq' | 'document' | 'url' | 'guideline') => {
    setType(selectedType)
    setStep('form')
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim() || !content.trim()) return

    setSaving(true)
    setError('')
    try {
      const res = await createKnowledgeSource({
        title: title.trim(),
        type,
        content: content.trim(),
      })
      onCreated(res.source)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar fonte de conhecimento.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">
            {step === 'select' ? 'Adicionar Base de Conhecimento RAG' : 'Nova Fonte de Conhecimento'}
          </h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {step === 'select' ? (
          <div className="mt-4 space-y-3">
            <p className="text-xs text-slate-500 mb-2">
              Escolha o formato da informação que a inteligência artificial consultará para tirar dúvidas e fechar vendas:
            </p>

            <button
              onClick={() => handleSelectType('faq')}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-blue-100 text-blue-600">
                <HelpCircle size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Perguntas Frequentes (FAQ)</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Dúvidas recorrentes sobre prazos, formas de pagamento, garantias e suporte.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleSelectType('document')}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-indigo-100 text-indigo-600">
                <FileText size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Catálogo / Tabela de Preços</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Detalhes técnicos de produtos, especificações, planos e valores vigentes.
                </p>
              </div>
            </button>

            <button
              onClick={() => handleSelectType('guideline')}
              className="flex w-full items-start gap-3 rounded-xl border border-slate-200 p-4 text-left hover:border-blue-500 hover:bg-blue-50/40 transition"
            >
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-amber-100 text-amber-600">
                <Shield size={18} />
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-900">Regras Comerciais & Diretrizes</h4>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Políticas de desconto, condições contratuais e roteiros de atendimento.
                </p>
              </div>
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-4">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Título da Fonte *
              </label>
              <input
                required
                type="text"
                placeholder="Ex: Política de Descontos e Prazos de Implantação"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
              />
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Conteúdo / Conhecimento para a IA *
              </label>
              <textarea
                required
                rows={6}
                placeholder="Insira as respostas, especificações e orientações detalhadas aqui..."
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 leading-relaxed font-sans"
              />
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-slate-100">
              <button
                type="button"
                className="text-xs font-semibold text-slate-500 hover:underline"
                onClick={() => setStep('select')}
              >
                ← Voltar
              </button>

              <div className="flex gap-2">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={onClose}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Adicionar ao Agente IA'}
                </button>
              </div>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

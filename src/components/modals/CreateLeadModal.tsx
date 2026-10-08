import { useEffect, useState } from 'react'
import { RelationSelect } from '../CrmRecordTools'
import { X } from 'lucide-react'
import {
  createLead,
  listUsers,
  type CrmContact,
  type CrmCompany,
  type PipelineStage,
  type CrmLead,
} from '../../lib/crm'

interface CreateLeadModalProps {
  stages: PipelineStage[]
  defaultStageId?: string
  contacts: CrmContact[]
  companies: CrmCompany[]
  onClose: () => void
  onCreated: (lead: CrmLead) => void
}

export default function CreateLeadModal({
  stages,
  defaultStageId,
  contacts,
  companies,
  onClose,
  onCreated,
}: CreateLeadModalProps) {
  const [title, setTitle] = useState('')
  const [valueReais, setValueReais] = useState('')
  const [stageId, setStageId] = useState(defaultStageId || stages[0]?.id || '')
  const [contactId, setContactId] = useState('')
  const [companyId, setCompanyId] = useState('')
  const [owner, setOwner] = useState('')
  const [users, setUsers] = useState<{id:string;name:string}[]>([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => { let active = true; listUsers().then(r => { if(active) setUsers(r.users) }).catch(e => { if(active) setError(e.message) }); return () => { active = false } }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const parsedReais = parseFloat(valueReais.replace(/\./g, '').replace(',', '.')) || 0
    const value_cents = Math.round(parsedReais * 100)

    setSaving(true)
    setError('')
    try {
      const res = await createLead({
        title: title.trim(),
        value_cents,
        stage_id: stageId || undefined,
        contact_id: contactId || undefined,
        company_id: companyId || undefined,
        assigned_user_id: owner || undefined,
      })
      onCreated(res.lead)
      onClose()
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao criar lead.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-xl bg-white p-6 shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <h3 className="text-base font-bold text-slate-900">Novo Negócio / Lead</h3>
          <button className="text-slate-400 hover:text-slate-600" onClick={onClose}>
            <X size={18} />
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 p-3 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Título da Oportunidade *
            </label>
            <input
              required
              type="text"
              placeholder="Ex: Contrato Anual - Hospedagem & CRM"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Valor Estimado (R$)
              </label>
              <div className="relative mt-1">
                <span className="absolute left-3 top-2 text-xs text-slate-400 font-bold">R$</span>
                <input
                  type="text"
                  placeholder="2.400,00"
                  value={valueReais}
                  onChange={(e) => setValueReais(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 py-2 pl-9 pr-3 text-xs font-mono font-bold outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                Etapa do Funil *
              </label>
              <select
                required
                value={stageId}
                onChange={(e) => setStageId(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
              >
                {stages.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Contato Vinculado
            </label>
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="">Nenhum contato selecionado</option>
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.company ? `(${c.company})` : ''} {c.phone ? `· ${c.phone}` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Empresa Vinculada
            </label>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
            >
              <option value="">Nenhuma empresa selecionada</option>
              {companies.map((comp) => (
                <option key={comp.id} value={comp.id}>
                  {comp.name} {comp.domain ? `(${comp.domain})` : ''}
                </option>
              ))}
            </select>
          </div>

          <RelationSelect label="Responsável" value={owner} options={users} onChange={setOwner} />
          <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
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
              {saving ? 'Criando...' : 'Criar Oportunidade'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

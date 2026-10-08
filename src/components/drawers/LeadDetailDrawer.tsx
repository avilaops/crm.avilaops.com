import LeadActivity from '../LeadActivity'
import { useState } from 'react'
import {
  CheckCircle2,
  DollarSign,
  Trash2,
  Trophy,
  User,
  X,
  XCircle,
} from 'lucide-react'
import {
  deleteLead,
  updateLead,
  updateLeadStage,
  type CrmLead,
  type PipelineStage,
} from '../../lib/crm'

interface LeadDetailDrawerProps {
  lead: CrmLead
  stages: PipelineStage[]
  onClose: () => void
  onUpdated: (lead: CrmLead) => void
  onDeleted: (leadId: string) => void
  onOpenContact?: (contactId: string) => void
}

export default function LeadDetailDrawer({
  lead: initialLead,
  stages,
  onClose,
  onUpdated,
  onDeleted,
  onOpenContact,
}: LeadDetailDrawerProps) {
  const [lead, setLead] = useState<CrmLead>(initialLead)
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(initialLead.title)
  const [valueReais, setValueReais] = useState(
    (initialLead.value_cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
  )
  const [saving, setSaving] = useState(false)

  const handleStatusChange = async (newStatus: 'open' | 'won' | 'lost') => {
    try {
      const reason = newStatus === 'lost' ? prompt('Motivo da perda (opcional):') : null
      if (newStatus === 'lost' && reason === null) return
      const res = await updateLead(lead.id, { status: newStatus, ...(newStatus === 'lost' ? {lost_reason: reason} : {}) })
      setLead(res.lead)
      onUpdated(res.lead)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao alterar status.')
    }
  }

  const handleStageChange = async (stageId: string) => {
    try {
      const res = await updateLeadStage(lead.id, stageId)
      setLead(res.lead)
      onUpdated(res.lead)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao mover etapa.')
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault()
    const parsedReais = parseFloat(valueReais.replace(/\./g, '').replace(',', '.')) || 0
    const value_cents = Math.round(parsedReais * 100)

    setSaving(true)
    try {
      const res = await updateLead(lead.id, {
        title: title.trim(),
        value_cents,
      })
      setLead(res.lead)
      onUpdated(res.lead)
      setEditing(false)
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar dados.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Deseja realmente remover esta oportunidade?')) return
    try {
      await deleteLead(lead.id)
      onDeleted(lead.id)
      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir lead.')
    }
  }

  const formatCurrency = (cents: number) => {
    return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100)
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-lg flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-blue-50 text-blue-600 font-bold">
              <DollarSign size={18} />
            </div>
            <div>
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                Oportunidade Comercial
              </span>
              <h3 className="text-sm font-bold text-slate-900 line-clamp-1">{lead.title}</h3>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              onClick={handleDelete}
              title="Excluir Oportunidade"
            >
              <Trash2 size={16} />
            </button>
            <button
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              onClick={onClose}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Status & Decisões de Venda */}
          <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="text-[11px] font-semibold text-slate-400">Valor Negociado</span>
                <p className="text-xl font-extrabold text-slate-900">{formatCurrency(lead.value_cents)}</p>
              </div>
              <div>
                {lead.status === 'won' && (
                  <span className="flex items-center gap-1 rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                    <Trophy size={13} /> Ganho
                  </span>
                )}
                {lead.status === 'lost' && (
                  <span className="flex items-center gap-1 rounded-full bg-rose-100 px-3 py-1 text-xs font-bold text-rose-800">
                    <XCircle size={13} /> Perdido
                  </span>
                )}
                {lead.status === 'open' && (
                  <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                    Em Aberto
                  </span>
                )}
              </div>
            </div>

            {/* Ações de Ganho / Perdido */}
            <div className="mt-4 flex gap-2 border-t border-slate-200/80 pt-3">
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
                onClick={() => handleStatusChange('won')}
              >
                <CheckCircle2 size={14} />
                <span>Marcar Ganho</span>
              </button>
              <button
                className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-xs font-semibold text-rose-600 hover:bg-rose-50"
                onClick={() => handleStatusChange('lost')}
              >
                <XCircle size={14} />
                <span>Marcar Perdido</span>
              </button>
              {lead.status !== 'open' && (
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => handleStatusChange('open')}
                >
                  Reabrir
                </button>
              )}
            </div>
          </div>

          {/* Etapa do Funil */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Etapa no Funil de Vendas
            </label>
            <select
              value={lead.stage_id ?? ''}
              onChange={(e) => handleStageChange(e.target.value)}
              className="mt-1.5 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-800 outline-none focus:border-blue-600"
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>

          {/* Detalhes / Edição */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">
                Informações da Oportunidade
              </span>
              <button
                className="text-xs font-semibold text-blue-600 hover:underline"
                onClick={() => setEditing(!editing)}
              >
                {editing ? 'Cancelar' : 'Editar'}
              </button>
            </div>

            {editing ? (
              <form onSubmit={handleSave} className="mt-3 space-y-3">
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Título</label>
                  <input
                    required
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-slate-600">Valor (R$)</label>
                  <input
                    type="text"
                    value={valueReais}
                    onChange={(e) => setValueReais(e.target.value)}
                    className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs font-mono outline-none focus:border-blue-600"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="submit"
                    disabled={saving}
                    className="rounded bg-blue-600 px-4 py-1.5 text-xs font-bold text-white hover:bg-blue-700"
                  >
                    {saving ? 'Salvando...' : 'Salvar'}
                  </button>
                </div>
              </form>
            ) : (
              <div className="mt-3 space-y-2 text-xs">
                <div>
                  <span className="text-slate-400">Título:</span>
                  <p className="font-semibold text-slate-800">{lead.title}</p>
                </div>
                <div>
                  <span className="text-slate-400">Criado em:</span>
                  <p className="font-semibold text-slate-800">
                    {new Date(lead.created_at).toLocaleDateString('pt-BR')}
                  </p>
                </div>
              </div>
            )}
          </div>

          <LeadActivity key={lead.id} id={lead.id} onUpdated={updated=>{setLead(old=>({...old,...updated}));onUpdated(updated)}} />
          {/* Contato Vinculado */}
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <span className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2">
              Contato Vinculado
            </span>
            {lead.contact_name ? (
              <div className="flex items-center justify-between rounded-lg bg-slate-50 p-3">
                <div className="flex items-center gap-2.5">
                  <div className="grid h-8 w-8 place-items-center rounded-full bg-blue-100 text-xs font-bold text-blue-700">
                    {lead.contact_name[0]?.toUpperCase() ?? <User size={14} />}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{lead.contact_name}</h4>
                    <p className="text-[11px] text-slate-400">{lead.contact_phone || 'Sem telefone'}</p>
                  </div>
                </div>
                {lead.contact_id && onOpenContact && (
                  <button
                    className="text-xs font-bold text-blue-600 hover:underline"
                    onClick={() => onOpenContact(lead.contact_id!)}
                  >
                    Ver Ficha
                  </button>
                )}
              </div>
            ) : (
              <p className="text-xs text-slate-400">Nenhum contato vinculado a este lead.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

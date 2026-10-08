import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import {
  Activity,
  ArrowRight,
  Clock,
  MessageSquare,
  Play,
  Power,
  RefreshCw,
  Trash2,
  Webhook,
  Workflow,
  X,
  Zap,
} from 'lucide-react'
import {
  createAutomation,
  deleteAutomation,
  listAutomations,
  testAutomation,
  toggleAutomation,
  type CrmAutomation,
} from '../../lib/crm'

export default function AutomationsPage() {
  const [automations, setAutomations] = useState<CrmAutomation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)
  const [testingId, setTestingId] = useState<string | null>(null)
  const [testResponse, setTestResponse] = useState<{ id: string; success: boolean; detail: string } | null>(null)

  const [form, setForm] = useState({
    name: '',
    trigger_type: 'stage_change',
    action_type: 'n8n_webhook',
    webhook_url: 'https://n8n.avilaops.com/webhook/crm-events',
    whatsapp_message: 'Olá! Recebemos sua solicitação e já estamos preparando sua proposta.',
    task_title: 'Realizar follow-up comercial via WhatsApp',
    active: true,
  })

  const loadData = () => {
    setLoading(true)
    listAutomations()
      .then((res) => {
        setAutomations(res.automations)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadData()
  }, [])

  const handleToggle = async (id: string) => {
    try {
      const res = await toggleAutomation(id)
      setAutomations((prev) =>
        prev.map((a) => (a.id === id ? { ...a, active: res.automation.active } : a))
      )
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao alterar status da regra.')
    }
  }

  const handleTest = async (id: string) => {
    setTestingId(id)
    setTestResponse(null)
    try {
      const res = await testAutomation(id)
      setTestResponse({
        id,
        success: res.result.success,
        detail: res.result.detail,
      })
      loadData()
    } catch (err: unknown) {
      setTestResponse({
        id,
        success: false,
        detail: err instanceof Error ? err.message : 'Falha ao testar disparo.',
      })
    } finally {
      setTestingId(null)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente excluir esta automação?')) return
    try {
      await deleteAutomation(id)
      setAutomations((prev) => prev.filter((a) => a.id !== id))
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir automação.')
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    let actionPayload: Record<string, unknown> = {}
    if (form.action_type === 'n8n_webhook') {
      actionPayload = { webhook_url: form.webhook_url.trim() }
    } else if (form.action_type === 'send_whatsapp') {
      actionPayload = { message: form.whatsapp_message.trim() }
    } else if (form.action_type === 'create_task') {
      actionPayload = { title: form.task_title.trim() }
    }

    setSaving(true)
    try {
      const res = await createAutomation({
        name: form.name.trim(),
        trigger_type: form.trigger_type,
        action_type: form.action_type,
        action_payload: actionPayload,
        active: form.active,
      })
      setAutomations((prev) => [res.automation, ...prev])
      setShowModal(false)
      setForm({
        name: '',
        trigger_type: 'stage_change',
        action_type: 'n8n_webhook',
        webhook_url: 'https://n8n.avilaops.com/webhook/crm-events',
        whatsapp_message: 'Olá! Recebemos sua solicitação e já estamos preparando sua proposta.',
        task_title: 'Realizar follow-up comercial via WhatsApp',
        active: true,
      })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao criar regra de automação.')
    } finally {
      setSaving(false)
    }
  }

  const getTriggerLabel = (type: string) => {
    switch (type) {
      case 'stage_change':
        return { label: 'Ao Mover Etapa no Funil', color: 'bg-blue-100 text-blue-800' }
      case 'message_received':
        return { label: 'Ao Receber Mensagem WhatsApp', color: 'bg-emerald-100 text-emerald-800' }
      case 'contact_created':
        return { label: 'Novo Contato Capturado', color: 'bg-violet-100 text-violet-800' }
      case 'task_overdue':
        return { label: 'Quando Tarefa Vencer', color: 'bg-amber-100 text-amber-800' }
      default:
        return { label: type, color: 'bg-slate-100 text-slate-800' }
    }
  }

  const getActionLabel = (type: string) => {
    switch (type) {
      case 'n8n_webhook':
        return { label: 'Disparar Webhook no n8n', icon: Webhook, color: 'bg-rose-50 text-rose-700 border-rose-200' }
      case 'send_whatsapp':
        return { label: 'Enviar Mensagem WhatsApp', icon: MessageSquare, color: 'bg-emerald-50 text-emerald-700 border-emerald-200' }
      case 'create_task':
        return { label: 'Criar Tarefa de Follow-up', icon: Clock, color: 'bg-amber-50 text-amber-700 border-amber-200' }
      case 'notify_team':
        return { label: 'Notificar Canal da Equipe', icon: Zap, color: 'bg-blue-50 text-blue-700 border-blue-200' }
      default:
        return { label: type, icon: Workflow, color: 'bg-slate-50 text-slate-700 border-slate-200' }
    }
  }

  const activeCount = automations.filter((a) => a.active).length
  const totalRuns = automations.reduce((acc, a) => acc + (a.runs_count || 0), 0)

  return (
    <div>
      <Topbar
        title="Automações & Webhooks n8n"
        tab={`${automations.length} regra(s) configurada(s)`}
        action="+ Nova Automação"
        onAction={() => setShowModal(true)}
      />

      <div className="space-y-6 p-6">
        {/* Painel Informativo */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-blue-50 text-blue-600">
                <Workflow size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Regras Ativas</p>
                <p className="text-xl font-bold text-slate-900">{activeCount} / {automations.length}</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-emerald-50 text-emerald-600">
                <Activity size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Total Executado</p>
                <p className="text-xl font-bold text-slate-900">{totalRuns} disparos</p>
              </div>
            </div>
          </div>
          <div className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-lg bg-rose-50 text-rose-600">
                <Webhook size={20} />
              </div>
              <div>
                <p className="text-xs text-slate-500 font-semibold uppercase">Integração n8n</p>
                <p className="text-xl font-bold text-slate-900">Operacional</p>
              </div>
            </div>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Lista de Automações */}
        <div className="space-y-4">
          {loading && (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center text-slate-400 text-xs">
              Carregando regras de automação...
            </div>
          )}

          {!loading && automations.length === 0 && (
            <div className="rounded-lg border border-slate-200 bg-white p-12 text-center shadow-sm">
              <Workflow size={36} className="mx-auto mb-3 text-slate-300" />
              <h4 className="text-sm font-bold text-slate-800">Nenhuma regra de automação ativa</h4>
              <p className="mt-1 text-xs text-slate-500 max-w-sm mx-auto">
                Crie fluxos para mover etapas de funil, disparar mensagens no WhatsApp ou acionar webhooks no n8n.
              </p>
              <button
                className="mt-4 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700"
                onClick={() => setShowModal(true)}
              >
                + Criar Primeira Automação
              </button>
            </div>
          )}

          {!loading &&
            automations.map((rule) => {
              const trigger = getTriggerLabel(rule.trigger_type)
              const action = getActionLabel(rule.action_type)
              const ActionIcon = action.icon

              return (
                <div
                  key={rule.id}
                  className={`rounded-xl border bg-white p-5 shadow-sm transition ${
                    rule.active ? 'border-slate-200 hover:border-slate-300' : 'border-slate-200/60 bg-slate-50/50 opacity-75'
                  }`}
                >
                  <div className="flex flex-col justify-between gap-4 lg:flex-row lg:items-center">
                    <div>
                      <div className="flex items-center gap-3">
                        <h4 className="text-sm font-bold text-slate-900">{rule.name}</h4>
                        <span
                          className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            rule.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-200 text-slate-600'
                          }`}
                        >
                          {rule.active ? 'Ativa' : 'Pausada'}
                        </span>
                      </div>

                      {/* Fluxo Visual Gatilho ➔ Ação */}
                      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-md px-2.5 py-1 font-semibold ${trigger.color}`}>
                          {trigger.label}
                        </span>
                        <ArrowRight size={14} className="text-slate-400" />
                        <span className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold ${action.color}`}>
                          <ActionIcon size={14} />
                          {action.label}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center gap-3 text-[11px] text-slate-400">
                        <span>Execuções: <strong className="text-slate-600">{rule.runs_count}</strong></span>
                        {rule.last_run_at && (
                          <span>
                            Último disparo: {new Date(rule.last_run_at).toLocaleString('pt-BR')}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Controles de Ação */}
                    <div className="flex items-center gap-2">
                      <button
                        disabled={testingId === rule.id}
                        className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-100 disabled:opacity-50"
                        onClick={() => handleTest(rule.id)}
                        title="Simular ou disparar teste real"
                      >
                        {testingId === rule.id ? (
                          <RefreshCw size={13} className="animate-spin text-blue-600" />
                        ) : (
                          <Play size={13} className="text-blue-600" />
                        )}
                        {testingId === rule.id ? 'Testando...' : 'Testar Disparo'}
                      </button>

                      <button
                        className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${
                          rule.active
                            ? 'border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                            : 'border-slate-300 bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                        onClick={() => handleToggle(rule.id)}
                      >
                        <Power size={13} />
                        {rule.active ? 'Ativa' : 'Desativada'}
                      </button>

                      <button
                        className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        onClick={() => handleDelete(rule.id)}
                        title="Excluir regra"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>

                  {/* Feedback de Teste */}
                  {testResponse && testResponse.id === rule.id && (
                    <div
                      className={`mt-4 rounded-lg border p-3 text-xs ${
                        testResponse.success
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                          : 'border-red-200 bg-red-50 text-red-900'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold">
                          {testResponse.success ? '✅ Teste Concluído com Sucesso' : '❌ Falha no Disparo'}
                        </span>
                        <button
                          className="text-slate-400 hover:text-slate-600"
                          onClick={() => setTestResponse(null)}
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <p className="mt-1 text-[11px] font-mono">{testResponse.detail}</p>
                    </div>
                  )}
                </div>
              )
            })}
        </div>
      </div>

      {/* Modal de Criação de Automação */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Nova Regra de Automação</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nome da Automação *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Notificar n8n ao enviar Proposta"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Gatilho de Disparo (Quando acontecer...)
                </label>
                <select
                  value={form.trigger_type}
                  onChange={(e) => setForm({ ...form, trigger_type: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                >
                  <option value="stage_change">Ao mover lead de etapa no Funil</option>
                  <option value="message_received">Ao receber nova mensagem de cliente no WhatsApp</option>
                  <option value="contact_created">Ao cadastrar ou capturar novo contato</option>
                  <option value="task_overdue">Quando uma tarefa vencer sem conclusão</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Ação Executada (O que o sistema fará...)
                </label>
                <select
                  value={form.action_type}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                >
                  <option value="n8n_webhook">Disparar Webhook HTTP POST para o n8n</option>
                  <option value="send_whatsapp">Enviar mensagem automática pelo WhatsApp</option>
                  <option value="create_task">Criar tarefa de follow-up no calendário</option>
                  <option value="notify_team">Enviar notificação no canal interno da equipe</option>
                </select>
              </div>

              {form.action_type === 'n8n_webhook' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    URL do Webhook n8n *
                  </label>
                  <input
                    required
                    type="url"
                    placeholder="https://n8n.seu-dominio.com/webhook/..."
                    value={form.webhook_url}
                    onChange={(e) => setForm({ ...form, webhook_url: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">
                    O CRM enviará o payload JSON completo com os dados do lead, contato e evento.
                  </p>
                </div>
              )}

              {form.action_type === 'send_whatsapp' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Texto da Mensagem no WhatsApp
                  </label>
                  <textarea
                    rows={3}
                    value={form.whatsapp_message}
                    onChange={(e) => setForm({ ...form, whatsapp_message: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              )}

              {form.action_type === 'create_task' && (
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Título da Tarefa
                  </label>
                  <input
                    type="text"
                    value={form.task_title}
                    onChange={(e) => setForm({ ...form, task_title: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setShowModal(false)}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
                >
                  {saving ? 'Salvando...' : 'Criar Automação'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

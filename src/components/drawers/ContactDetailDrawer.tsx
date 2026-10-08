import { RecordRelations } from '../CrmRecordTools'
import { useEffect, useState } from 'react'
import {
  Clock,
  History,
  Mail,
  MessageSquare,
  Trash2,
  User,
  X,
} from 'lucide-react'
import {
  createTask,
  deleteContact,
  getContactTimeline,
  updateContact,
  updateTask,
  type CrmContact,
} from '../../lib/crm'

interface ContactDetailDrawerProps {
  contactId: string
  onClose: () => void
  onUpdated?: (contact: CrmContact) => void
  onDeleted?: (contactId: string) => void
}

export default function ContactDetailDrawer({
  contactId,
  onClose,
  onUpdated,
  onDeleted,
}: ContactDetailDrawerProps) {
  const [data, setData] = useState<{
    contact: CrmContact
    events: { id: string; entity_type: string; event_type: string; payload: Record<string, unknown>; created_at: string }[]
    tasks: { id: string; title: string; description: string | null; priority: string; due_at: string | null; status: string; created_at: string }[]
    messages: { id: string; direction: string; body: string; sent_at: string; status: string }[]
  } | null>(null)

  const [error,setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'timeline' | 'tasks' | 'messages'>('timeline')
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    tags: '',
  })
  const [saving, setSaving] = useState(false)
  const [newTaskTitle, setNewTaskTitle] = useState('')
  const [addingTask, setAddingTask] = useState(false)

  const loadDetails = () => {
    setLoading(true)
    getContactTimeline(contactId)
      .then((res) => {
        setError('')
        setData(res)
        setForm({
          name: res.contact.name,
          email: res.contact.email || '',
          phone: res.contact.phone || '',
          company: res.contact.company || '',
          tags: res.contact.tags ? res.contact.tags.join(', ') : '',
        })
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadDetails()
  }, [contactId])

  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    try {
      const tagList = form.tags
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)

      const res = await updateContact(contactId, {
        name: form.name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        company: form.company.trim() || null,
        tags: tagList,
      })
      onUpdated?.(res.contact)
      setEditing(false)
      loadDetails()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao atualizar contato.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async () => {
    if (!confirm('Deseja realmente remover este contato?')) return
    try {
      await deleteContact(contactId)
      onDeleted?.(contactId)
      onClose()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao remover contato.')
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!newTaskTitle.trim()) return
    setAddingTask(true)
    try {
      await createTask({
        title: newTaskTitle.trim(),
        contactId,
        priority: 'medium',
      })
      setNewTaskTitle('')
      loadDetails()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao adicionar tarefa.')
    } finally {
      setAddingTask(false)
    }
  }

  const handleToggleTask = async (taskId: string, currentStatus: string) => {
    const nextStatus = currentStatus === 'open' ? 'completed' : 'open'
    try {
      await updateTask(taskId, { status: nextStatus })
      loadDetails()
    } catch (err: unknown) {
      console.error(err)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/40">
      <div className="flex h-full w-full max-w-xl flex-col bg-white shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header do Drawer */}
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-blue-100 text-sm font-bold text-blue-700">
              {data?.contact.name.slice(0, 2).toUpperCase() ?? <User size={18} />}
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">{data?.contact.name ?? 'Carregando...'}</h3>
              <p className="text-xs text-slate-400">{data?.contact.company || 'Contato Individual'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              className="rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
              onClick={handleDelete}
              title="Excluir Contato"
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

        {loading && (
          <div className="flex-1 grid place-items-center text-xs text-slate-400">
            Carregando ficha do contato...
          </div>
        )}

        {error && <p role="alert" className="p-4 text-sm text-red-700">{error}<button onClick={loadDetails} className="ml-2 underline">Tentar novamente</button></p>}
        {!loading && data && (
          <div className="flex-1 overflow-y-auto">
            <RecordRelations kind="contacts" id={contactId} initial={data.contact} onSaved={loadDetails} />
            {/* Informações Principais e Ações Rápidas */}
            <div className="border-b border-slate-100 bg-slate-50/60 p-5">
              <div className="flex flex-wrap items-center gap-2">
                {data.contact.phone && (
                  <a
                    href={`https://wa.me/${data.contact.phone.replace(/\D/g, '')}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700"
                  >
                    <MessageSquare size={13} />
                    <span>WhatsApp</span>
                  </a>
                )}
                {data.contact.email && (
                  <a
                    href={`mailto:${data.contact.email}`}
                    className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Mail size={13} />
                    <span>Enviar E-mail</span>
                  </a>
                )}
                <button
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  onClick={() => setEditing(!editing)}
                >
                  {editing ? 'Cancelar Edição' : 'Editar Dados'}
                </button>
              </div>

              {/* Form de Edição Rápida */}
              {editing ? (
                <form onSubmit={handleSaveContact} className="mt-4 space-y-3 rounded-lg border border-slate-200 bg-white p-4">
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Nome</label>
                    <input
                      required
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Telefone / WhatsApp</label>
                      <input
                        type="text"
                        value={form.phone}
                        onChange={(e) => setForm({ ...form, phone: e.target.value })}
                        className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">E-mail</label>
                      <input
                        type="email"
                        value={form.email}
                        onChange={(e) => setForm({ ...form, email: e.target.value })}
                        className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-600">Tags (vírgula)</label>
                    <input
                      type="text"
                      placeholder="vip, lead-quente"
                      value={form.tags}
                      onChange={(e) => setForm({ ...form, tags: e.target.value })}
                      className="mt-1 w-full rounded border border-slate-200 px-2.5 py-1.5 text-xs outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <button
                      type="button"
                      className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600"
                      onClick={() => setEditing(false)}
                    >
                      Cancelar
                    </button>
                    <button
                      type="submit"
                      disabled={saving}
                      className="rounded bg-blue-600 px-4 py-1 text-xs font-bold text-white"
                    >
                      {saving ? 'Salvando...' : 'Salvar Alterações'}
                    </button>
                  </div>
                </form>
              ) : (
                <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400">Telefone:</span>
                    <p className="font-semibold text-slate-800">{data.contact.phone || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">E-mail:</span>
                    <p className="font-semibold text-slate-800">{data.contact.email || '-'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Origem:</span>
                    <p className="font-semibold text-slate-800 uppercase text-[11px]">{data.contact.source || 'Manual'}</p>
                  </div>
                  <div>
                    <span className="text-slate-400">Tags:</span>
                    <div className="mt-0.5 flex flex-wrap gap-1">
                      {data.contact.tags && data.contact.tags.length > 0 ? (
                        data.contact.tags.map((t) => (
                          <span key={t} className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                            #{t}
                          </span>
                        ))
                      ) : (
                        <span className="text-slate-400">-</span>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Abas de Navegação */}
            <div className="flex border-b border-slate-200 bg-white px-5">
              <button
                className={`flex items-center gap-1.5 border-b-2 py-3 text-xs font-bold transition ${
                  activeTab === 'timeline'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('timeline')}
              >
                <History size={14} />
                <span>Timeline ({data.events.length})</span>
              </button>
              <button
                className={`ml-5 flex items-center gap-1.5 border-b-2 py-3 text-xs font-bold transition ${
                  activeTab === 'tasks'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('tasks')}
              >
                <Clock size={14} />
                <span>Tarefas ({data.tasks.length})</span>
              </button>
              <button
                className={`ml-5 flex items-center gap-1.5 border-b-2 py-3 text-xs font-bold transition ${
                  activeTab === 'messages'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
                onClick={() => setActiveTab('messages')}
              >
                <MessageSquare size={14} />
                <span>Mensagens ({data.messages.length})</span>
              </button>
            </div>

            {/* Conteúdo das Abas */}
            <div className="p-5">
              {activeTab === 'timeline' && (
                <div className="space-y-4">
                  {data.events.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-8">Nenhum evento registrado ainda.</p>
                  )}
                  {data.events.map((evt) => (
                    <div key={evt.id} className="relative pl-6 before:absolute before:left-2 before:top-2 before:h-full before:w-0.5 before:bg-slate-200 last:before:hidden">
                      <div className="absolute left-0 top-1.5 h-4 w-4 rounded-full bg-blue-500 ring-4 ring-white" />
                      <div className="rounded-lg border border-slate-100 bg-slate-50 p-3 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-900">{evt.event_type}</span>
                          <span className="text-[10px] text-slate-400">
                            {new Date(evt.created_at).toLocaleString('pt-BR')}
                          </span>
                        </div>
                        {evt.payload && (
                          <pre className="mt-1 text-[11px] text-slate-600 whitespace-pre-wrap font-mono">
                            {JSON.stringify(evt.payload, null, 2)}
                          </pre>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {activeTab === 'tasks' && (
                <div className="space-y-4">
                  {/* Formulário rápido de criação de tarefa */}
                  <form onSubmit={handleCreateTask} className="flex gap-2">
                    <input
                      type="text"
                      placeholder="+ Adicionar tarefa para este contato..."
                      value={newTaskTitle}
                      onChange={(e) => setNewTaskTitle(e.target.value)}
                      className="flex-1 rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                    />
                    <button
                      type="submit"
                      disabled={addingTask || !newTaskTitle.trim()}
                      className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 disabled:opacity-50"
                    >
                      {addingTask ? '...' : 'Criar'}
                    </button>
                  </form>

                  {data.tasks.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-6">Nenhuma tarefa cadastrada para este contato.</p>
                  )}

                  <div className="space-y-2">
                    {data.tasks.map((task) => (
                      <div
                        key={task.id}
                        onClick={() => handleToggleTask(task.id, task.status)}
                        className="flex cursor-pointer items-center justify-between rounded-lg border border-slate-200 bg-white p-3 hover:bg-slate-50 transition"
                      >
                        <div className="flex items-center gap-3">
                          <input
                            type="checkbox"
                            checked={task.status === 'completed'}
                            readOnly
                            className="rounded text-blue-600 focus:ring-blue-500"
                          />
                          <span className={`text-xs font-semibold ${task.status === 'completed' ? 'line-through text-slate-400' : 'text-slate-800'}`}>
                            {task.title}
                          </span>
                        </div>
                        {task.due_at && (
                          <span className="text-[10px] text-slate-400 font-mono">
                            {new Date(task.due_at).toLocaleDateString('pt-BR')}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'messages' && (
                <div className="space-y-3">
                  {data.messages.length === 0 && (
                    <p className="text-center text-xs text-slate-400 py-8">Nenhuma mensagem registrada nesta conversa.</p>
                  )}
                  {data.messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={`flex flex-col ${msg.direction === 'outbound' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-md rounded-xl p-3 text-xs shadow-sm ${
                          msg.direction === 'outbound'
                            ? 'bg-blue-600 text-white rounded-br-none'
                            : 'bg-slate-100 text-slate-800 rounded-bl-none'
                        }`}
                      >
                        <p className="whitespace-pre-wrap">{msg.body}</p>
                        <span className={`mt-1 block text-[10px] ${msg.direction === 'outbound' ? 'text-blue-100 text-right' : 'text-slate-400'}`}>
                          {new Date(msg.sent_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

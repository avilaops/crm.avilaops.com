import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import {
  Filter,
  Trash2,
  Users,
  X,
} from 'lucide-react'
import {
  createSegment,
  deleteSegment,
  getSegmentContacts,
  listSegments,
  type CrmContact,
  type CrmSegment,
} from '../../lib/crm'

export default function SegmentsPage() {
  const [segments, setSegments] = useState<CrmSegment[]>([])
  const [selectedSegmentId, setSelectedSegmentId] = useState<string | null>(null)
  const [selectedContacts, setSelectedContacts] = useState<CrmContact[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingContacts, setLoadingContacts] = useState(false)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    name: '',
    description: '',
    tags: '',
    source: '',
    newsletter_status: '',
    has_phone: false,
    has_email: false,
  })

  const loadSegments = () => {
    setLoading(true)
    listSegments()
      .then((res) => {
        setSegments(res.segments)
        if (res.segments.length > 0 && !selectedSegmentId) {
          setSelectedSegmentId(res.segments[0].id)
        }
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSegments()
  }, [])

  useEffect(() => {
    if (!selectedSegmentId) {
      setSelectedContacts([])
      return
    }
    setLoadingContacts(true)
    getSegmentContacts(selectedSegmentId)
      .then((res) => {
        setSelectedContacts(res.contacts)
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoadingContacts(false))
  }, [selectedSegmentId])

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return

    const tagList = form.tags
      .split(',')
      .map((t) => t.trim().toLowerCase())
      .filter(Boolean)

    const rules: Record<string, unknown> = {}
    if (tagList.length > 0) rules.tags = tagList
    if (form.source.trim()) rules.source = form.source.trim()
    if (form.newsletter_status.trim()) rules.newsletter_status = form.newsletter_status.trim()
    if (form.has_phone) rules.has_phone = true
    if (form.has_email) rules.has_email = true

    setSaving(true)
    try {
      const res = await createSegment({
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        rules,
      })
      setSegments((prev) => [...prev, res.segment])
      setSelectedSegmentId(res.segment.id)
      setShowModal(false)
      setForm({
        name: '',
        description: '',
        tags: '',
        source: '',
        newsletter_status: '',
        has_phone: false,
        has_email: false,
      })
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao criar segmento.')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este segmento?')) return
    try {
      await deleteSegment(id)
      setSegments((prev) => prev.filter((s) => s.id !== id))
      if (selectedSegmentId === id) {
        const remaining = segments.filter((s) => s.id !== id)
        setSelectedSegmentId(remaining[0]?.id ?? null)
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao excluir segmento.')
    }
  }

  const selectedSegment = segments.find((s) => s.id === selectedSegmentId)

  return (
    <div>
      <Topbar
        title="Segmentos & Públicos"
        tab={`${segments.length} segmento(s)`}
        action="+ Novo Segmento"
        onAction={() => setShowModal(true)}
      />

      <div className="p-6">
        {error && (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          {/* Coluna Esquerda: Lista de Segmentos */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                Segmentos Salvos
              </span>
              <button
                className="text-xs font-bold text-blue-600 hover:underline"
                onClick={() => setShowModal(true)}
              >
                + Criar
              </button>
            </div>

            {loading && (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-xs text-slate-400">
                Carregando segmentos...
              </div>
            )}

            {!loading && segments.length === 0 && (
              <div className="rounded-lg border border-slate-200 bg-white p-8 text-center shadow-sm">
                <Filter size={24} className="mx-auto mb-2 text-slate-300" />
                <p className="text-xs font-bold text-slate-700">Nenhum segmento criado</p>
                <p className="text-[11px] text-slate-400 mt-1">Crie públicos inteligentes por tags, comportamento ou canal.</p>
              </div>
            )}

            {!loading &&
              segments.map((segment) => {
                const isSelected = segment.id === selectedSegmentId
                return (
                  <div
                    key={segment.id}
                    onClick={() => setSelectedSegmentId(segment.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition ${
                      isSelected
                        ? 'border-blue-600 bg-blue-50/40 shadow-sm'
                        : 'border-slate-200 bg-white hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold text-slate-900">{segment.name}</h4>
                      <button
                        className="text-slate-300 hover:text-red-600 p-1"
                        onClick={(e) => {
                          e.stopPropagation()
                          handleDelete(segment.id)
                        }}
                        title="Excluir"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>

                    {segment.description && (
                      <p className="mt-1 text-[11px] text-slate-500 line-clamp-2">
                        {segment.description}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[10px]">
                      {segment.rules?.tags?.map((t) => (
                        <span key={t} className="rounded bg-slate-100 px-1.5 py-0.5 font-semibold text-slate-600">
                          #{t}
                        </span>
                      ))}
                      {segment.rules?.has_phone && (
                        <span className="rounded bg-emerald-100 px-1.5 py-0.5 font-semibold text-emerald-800">
                          WhatsApp
                        </span>
                      )}
                      {segment.rules?.has_email && (
                        <span className="rounded bg-blue-100 px-1.5 py-0.5 font-semibold text-blue-800">
                          E-mail
                        </span>
                      )}
                    </div>
                  </div>
                )
              })}
          </div>

          {/* Coluna Direita: Detalhes do Segmento e Contatos */}
          <div className="space-y-4">
            {selectedSegment ? (
              <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="border-b border-slate-100 p-5">
                  <div className="flex items-center justify-between">
                    <div>
                      <h3 className="text-base font-bold text-slate-900">{selectedSegment.name}</h3>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {selectedSegment.description || 'Critérios de filtro aplicados em tempo real na base de contatos.'}
                      </p>
                    </div>
                    <span className="rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800">
                      {selectedContacts.length} contato(s)
                    </span>
                  </div>
                </div>

                {/* Tabela de Contatos do Segmento */}
                <div className="overflow-x-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-4 py-3 font-semibold">Contato</th>
                        <th className="px-4 py-3 font-semibold">WhatsApp / Telefone</th>
                        <th className="px-4 py-3 font-semibold">E-mail</th>
                        <th className="px-4 py-3 font-semibold">Tags</th>
                        <th className="px-4 py-3 font-semibold">Newsletter</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {loadingContacts && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-slate-400">
                            Filtrando base de contatos...
                          </td>
                        </tr>
                      )}
                      {!loadingContacts && selectedContacts.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-12 text-center text-slate-400">
                            <Users size={32} className="mx-auto mb-2 text-slate-300" />
                            Nenhum contato encontrado com os critérios deste segmento.
                          </td>
                        </tr>
                      )}
                      {!loadingContacts &&
                        selectedContacts.map((contact) => (
                          <tr key={contact.id} className="hover:bg-slate-50 transition">
                            <td className="px-4 py-3 font-bold text-slate-900">
                              {contact.name}
                              {contact.company && (
                                <span className="block text-[11px] font-normal text-slate-400">
                                  {contact.company}
                                </span>
                              )}
                            </td>
                            <td className="px-4 py-3 font-mono text-slate-600">
                              {contact.phone || '-'}
                            </td>
                            <td className="px-4 py-3 text-slate-600">
                              {contact.email || '-'}
                            </td>
                            <td className="px-4 py-3">
                              {contact.tags && contact.tags.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {contact.tags.map((tag) => (
                                    <span key={tag} className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-600">
                                      {tag}
                                    </span>
                                  ))}
                                </div>
                              ) : (
                                '-'
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                                {contact.newsletter_status ?? 'subscribed'}
                              </span>
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400 shadow-sm">
                Selecione ou crie um segmento para visualizar os contatos filtrados.
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Criação de Segmento */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Criar Novo Segmento de Contatos</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowModal(false)}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreate} className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Nome do Segmento *
                </label>
                <input
                  required
                  type="text"
                  placeholder="Ex: Clientes VIP WhatsApp"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Descrição
                </label>
                <input
                  type="text"
                  placeholder="Ex: Contatos com tag vip e telefone ativo para disparo"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Filtrar por Tags (separadas por vírgula)
                </label>
                <input
                  type="text"
                  placeholder="vip, lead-quente, orcamento"
                  value={form.tags}
                  onChange={(e) => setForm({ ...form, tags: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Origem do Contato
                  </label>
                  <select
                    value={form.source}
                    onChange={(e) => setForm({ ...form, source: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                  >
                    <option value="">Qualquer origem</option>
                    <option value="whatsapp">WhatsApp</option>
                    <option value="site">Site / Formulário</option>
                    <option value="indicacao">Indicação</option>
                    <option value="manual">Cadastro Manual</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Status Newsletter
                  </label>
                  <select
                    value={form.newsletter_status}
                    onChange={(e) => setForm({ ...form, newsletter_status: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                  >
                    <option value="">Qualquer status</option>
                    <option value="subscribed">Inscrito (Ativo)</option>
                    <option value="unsubscribed">Descadastrado</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-slate-100">
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.has_phone}
                    onChange={(e) => setForm({ ...form, has_phone: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Apenas contatos com número de telefone preenchido
                </label>
                <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.has_email}
                    onChange={(e) => setForm({ ...form, has_email: e.target.checked })}
                    className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  Apenas contatos com e-mail preenchido
                </label>
              </div>

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
                  {saving ? 'Salvando...' : 'Salvar Segmento'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

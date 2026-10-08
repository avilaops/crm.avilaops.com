import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import {
  Building2,
  Download,
  Mail,
  Phone,
  Search,
  User,
  Users,
} from 'lucide-react'
import {
  listCompanies,
  listContacts,
  type CrmCompany,
  type CrmContact,
} from '../../lib/crm'
import ContactDetailDrawer from '../../components/drawers/ContactDetailDrawer'

type UnifiedItem = {
  id: string
  type: 'contact' | 'company'
  name: string
  detail: string
  phone: string | null
  email: string | null
  tagOrCnpj: string | null
  updated_at: string
}

export default function AllContactsPage() {
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [search, setSearch] = useState('')
  const [typeFilter, setTypeFilter] = useState<'all' | 'contact' | 'company'>('all')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      listContacts({ search, page: 1, pageSize: 100 }),
      listCompanies({ search, page: 1, pageSize: 100 }),
    ])
      .then(([contactsRes, companiesRes]) => {
        setContacts(contactsRes.contacts)
        setCompanies(companiesRes.companies)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timer = setTimeout(() => {
      loadData()
    }, 250)
    return () => clearTimeout(timer)
  }, [search])

  const unifiedList: UnifiedItem[] = [
    ...contacts.map((c) => ({
      id: c.id,
      type: 'contact' as const,
      name: c.name,
      detail: c.company || 'Contato Individual',
      phone: c.phone,
      email: c.email,
      tagOrCnpj: c.source || null,
      updated_at: c.updated_at,
    })),
    ...companies.map((comp) => ({
      id: comp.id,
      type: 'company' as const,
      name: comp.name,
      detail: comp.domain || 'Empresa Cadastrada',
      phone: comp.phone,
      email: comp.email,
      tagOrCnpj: comp.cnpj || null,
      updated_at: comp.updated_at,
    })),
  ].filter((item) => {
    if (typeFilter === 'contact') return item.type === 'contact'
    if (typeFilter === 'company') return item.type === 'company'
    return true
  })

  const handleExportCsv = () => {
    const header = ['ID', 'Tipo', 'Nome/Razao', 'Detalhe/Vinculo', 'Telefone', 'Email', 'Origem/Documento', 'AtualizadoEm']
    const rows = unifiedList.map((item) => [
      `"${item.id}"`,
      `"${item.type === 'company' ? 'Empresa' : 'Contato'}"`,
      `"${(item.name || '').replace(/"/g, '""')}"`,
      `"${(item.detail || '').replace(/"/g, '""')}"`,
      `"${item.phone || ''}"`,
      `"${item.email || ''}"`,
      `"${item.tagOrCnpj || ''}"`,
      `"${item.updated_at}"`,
    ])

    const csvContent = 'data:text/csv;charset=utf-8,\uFEFF' + [header.join(','), ...rows.map((r) => r.join(','))].join('\n')
    const encodedUri = encodeURI(csvContent)
    const link = document.createElement('a')
    link.setAttribute('href', encodedUri)
    link.setAttribute('download', `base_contatos_avilaops_${new Date().toISOString().slice(0, 10)}.csv`)
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
  }

  return (
    <div>
      <Topbar
        title="Base Unificada de Contatos & Empresas"
        tab={`${unifiedList.length} registro(s) encontrado(s)`}
      />

      <div className="space-y-6 p-6">
        {/* Filtros e Busca */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex flex-1 items-center gap-2 max-w-md rounded-md bg-slate-50 border border-slate-200 px-3 py-1.5">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por nome, empresa, e-mail, telefone ou documento..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                typeFilter === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setTypeFilter('all')}
            >
              Todos ({contacts.length + companies.length})
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                typeFilter === 'contact'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setTypeFilter('contact')}
            >
              Contatos ({contacts.length})
            </button>
            <button
              className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                typeFilter === 'company'
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
              onClick={() => setTypeFilter('company')}
            >
              Empresas ({companies.length})
            </button>

            <button
              onClick={handleExportCsv}
              className="flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
              title="Exportar base para CSV"
            >
              <Download size={13} />
              <span>Exportar CSV</span>
            </button>
          </div>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {/* Tabela Unificada */}
        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
                <tr>
                  <th className="px-4 py-3 font-semibold">Nome / Razão</th>
                  <th className="px-4 py-3 font-semibold">Tipo</th>
                  <th className="px-4 py-3 font-semibold">Vínculo / Domínio</th>
                  <th className="px-4 py-3 font-semibold">WhatsApp / Telefone</th>
                  <th className="px-4 py-3 font-semibold">E-mail</th>
                  <th className="px-4 py-3 font-semibold">Origem / Documento</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading && (
                  <tr>
                    <td colSpan={6} className="py-8 text-center text-slate-400">
                      Carregando registros...
                    </td>
                  </tr>
                )}
                {!loading && unifiedList.length === 0 && (
                  <tr>
                    <td colSpan={6} className="py-12 text-center text-slate-400">
                      <Users size={32} className="mx-auto mb-2 text-slate-300" />
                      Nenhum contato ou empresa encontrado.
                    </td>
                  </tr>
                )}
                {!loading &&
                  unifiedList.map((item) => (
                    <tr
                      key={`${item.type}-${item.id}`}
                      onClick={() => {
                        if (item.type === 'contact') {
                          setSelectedContactId(item.id)
                        }
                      }}
                      className={`transition ${item.type === 'contact' ? 'cursor-pointer hover:bg-blue-50/40' : 'hover:bg-slate-50/70'}`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2.5">
                          <div
                            className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-bold ${
                              item.type === 'company'
                                ? 'bg-indigo-100 text-indigo-700'
                                : 'bg-blue-100 text-blue-700'
                            }`}
                          >
                            {item.type === 'company' ? (
                              <Building2 size={13} />
                            ) : (
                              <User size={13} />
                            )}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900">{item.name}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                            item.type === 'company'
                              ? 'bg-indigo-50 text-indigo-700 border border-indigo-200'
                              : 'bg-blue-50 text-blue-700 border border-blue-200'
                          }`}
                        >
                          {item.type === 'company' ? 'Empresa' : 'Contato'}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 font-medium">{item.detail}</td>
                      <td className="px-4 py-3 font-mono text-slate-600">
                        {item.phone ? (
                          <span className="flex items-center gap-1">
                            <Phone size={12} className="text-slate-400" />
                            {item.phone}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {item.email ? (
                          <span className="flex items-center gap-1">
                            <Mail size={12} className="text-slate-400" />
                            {item.email}
                          </span>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-500 font-mono text-[11px]">
                        {item.tagOrCnpj || '-'}
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {selectedContactId && (
        <ContactDetailDrawer
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onUpdated={(updated) => {
            setContacts((prev) => prev.map((c) => (c.id === updated.id ? updated : c)))
          }}
          onDeleted={(deletedId) => {
            setContacts((prev) => prev.filter((c) => c.id !== deletedId))
            setSelectedContactId(null)
          }}
        />
      )}
    </div>
  )
}

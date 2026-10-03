import { ShieldCheck } from 'lucide-react'
import { useEffect, useState } from 'react'
import { Notice } from '../../components/ui/Form'
import { EmptyState } from '../../components/ui/Rows'
import { listAuditLogs, type AuditLogEntry } from '../../lib/crm'
import { SettingsFrame } from './SettingsFrame'

const categories = [
  { value: 'all', label: 'Todas as categorias' },
  { value: 'message', label: 'Mensagens e WhatsApp' },
  { value: 'lead', label: 'Leads e funil' },
  { value: 'contact', label: 'Contatos' },
  { value: 'task', label: 'Tarefas' },
  { value: 'company', label: 'Empresas' },
  { value: 'integration', label: 'Integrações' },
  { value: 'auth', label: 'Acesso' },
  { value: 'user', label: 'Usuários' },
  { value: 'settings', label: 'Configurações' },
]

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'medium' })

function tone(eventType: string) {
  if (eventType.includes('failed') || eventType.includes('deleted') || eventType.includes('rejected') || eventType.includes('invalid')) return 'bg-red-50 text-red-700'
  if (eventType.includes('created') || eventType.includes('login') || eventType.includes('connected')) return 'bg-emerald-50 text-emerald-800'
  if (eventType.includes('updated') || eventType.includes('sent') || eventType.includes('changed')) return 'bg-blue-50 text-blue-700'
  return 'bg-slate-100 text-slate-700'
}

/**
 * Área de trabalho › Segurança e auditoria.
 *
 * Saiu do menu principal: estava lá e aqui ao mesmo tempo. No celular cada
 * evento é um cartão; os detalhes (o JSON gravado) abrem sob demanda.
 */
export function AuditLogsPage() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    const timeout = window.setTimeout(() => {
      setLoading(true)
      listAuditLogs({ entityType, search, page: 1, pageSize: 50 })
        .then((data) => {
          if (!active) return
          setLogs(data.logs)
          setTotal(data.pagination.total)
          setError('')
        })
        .catch((caught: Error) => active && setError(caught.message))
        .finally(() => active && setLoading(false))
    }, 250)
    return () => {
      active = false
      window.clearTimeout(timeout)
    }
  }, [entityType, search])

  return (
    <SettingsFrame page="audit-logs" title="Segurança e auditoria" wide>
      <div className="space-y-4">
        <p className="text-sm text-slate-600">
          Quem fez o quê, e quando: entradas no sistema, conexões de canais e integrações, mudanças de usuários e configurações.
          {total > 0 && ` ${total} evento(s).`}
        </p>
        <div className="grid gap-3 medium:grid-cols-[minmax(0,1fr)_16rem]">
          <input
            type="search"
            className="input"
            placeholder="Buscar por pessoa, e-mail ou evento"
            aria-label="Buscar eventos"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select className="input" aria-label="Categoria" value={entityType} onChange={(event) => setEntityType(event.target.value)}>
            {categories.map((category) => (
              <option key={category.value} value={category.value}>{category.label}</option>
            ))}
          </select>
        </div>
        {error && <Notice tone="danger">{error}</Notice>}
        <section className="rounded-xl border border-slate-200 bg-white">
          {loading && logs.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Carregando…</p>}
          {!loading && logs.length === 0 && (
            <EmptyState icon={ShieldCheck} title="Nenhum evento encontrado" description="Mude a busca ou a categoria para ver outros registros." />
          )}
          <ul className="divide-y divide-slate-100">
            {logs.map((log) => (
              <li key={log.id} className="px-4 py-3">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 font-mono text-xs font-semibold ${tone(log.event_type)}`}>{log.event_type}</span>
                  <span className="text-xs uppercase tracking-wide text-slate-500">{log.entity_type}</span>
                </div>
                <p className="mt-1 text-sm text-slate-800">
                  {log.user_name ?? 'Sistema ou integração'}
                  {log.user_email && <span className="text-slate-500"> · {log.user_email}</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {dateTime.format(new Date(log.created_at))}
                  {log.request_id && <span className="font-mono"> · {log.request_id.slice(0, 13)}</span>}
                </p>
                <details className="mt-1 group">
                  <summary className="inline-flex min-h-11 cursor-pointer list-none items-center text-sm font-medium text-blue-700 [&::-webkit-details-marker]:hidden">
                    Ver detalhes
                  </summary>
                  <pre className="mt-1 max-h-72 overflow-auto rounded-lg bg-slate-950 p-3 font-mono text-xs text-emerald-300">{JSON.stringify(log.payload, null, 2)}</pre>
                </details>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </SettingsFrame>
  )
}

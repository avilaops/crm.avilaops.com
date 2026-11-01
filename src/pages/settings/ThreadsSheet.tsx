import { useState } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { Notice } from '../../components/ui/Form'
import { getThreadsInsights, type ThreadsStatus, type ThreadsInsights } from '../../lib/threads'
import { buttonClass } from '../../lib/ui'

const labels: Record<string, string> = { views: 'Visualizações', likes: 'Curtidas', replies: 'Respostas', reposts: 'Reposts', quotes: 'Citações' }
const date = (value: string) => new Date(value).toLocaleString('pt-BR')

export function ThreadsSheet({ open, onClose, status, error, onRefresh }: {
  open: boolean; onClose: () => void; status: ThreadsStatus | null; error: string; onRefresh: () => void
}) {
  const [insights, setInsights] = useState<ThreadsInsights | null>(null)
  const [failure, setFailure] = useState('')
  const [busy, setBusy] = useState(false)
  async function readInsights() {
    setBusy(true); setFailure(''); setInsights(null)
    try { setInsights((await getThreadsInsights()).insights) }
    catch (caught) { setFailure(caught instanceof Error ? caught.message : 'Não foi possível consultar os resultados.') }
    finally { setBusy(false) }
  }
  return <Sheet open={open} onClose={onClose} title="Threads" description="Conta e resultados públicos da sua empresa">
    <div className="space-y-4 p-4">
      {error && <Notice tone="warning">{error}</Notice>}
      {status && <>
        <p>{status.connected ? `Conta conectada: @${status.account?.username ?? 'Threads'}` : 'Nenhuma conexão válida para esta empresa.'}</p>
        {status.account?.expiresAt && <p className="text-sm text-slate-500">Autorização válida até {date(status.account.expiresAt)}.</p>}
        <p className="text-sm text-slate-500">O estado reflete a última autorização registrada. A consulta de resultados verifica o acesso novamente.</p>
        <p className="text-sm">Publicação: {status.capabilities.publish ? 'autorizada no Hub Social' : 'não autorizada'}. Resultados: {status.capabilities.insights ? 'autorizados' : 'não autorizados'}.</p>
      </>}
      <p className="text-sm text-slate-500">A equipe responsável conecta a conta e aprova as publicações no Hub Social. O CRM acompanha os resultados desta empresa.</p>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={buttonClass.secondary} onClick={onRefresh}>Atualizar conexão</button>
        <button type="button" className={buttonClass.primary} disabled={busy || !status?.capabilities.insights} onClick={() => void readInsights()}>{busy ? 'Consultando…' : 'Consultar resultados'}</button>
      </div>
      {failure && <Notice tone="danger">{failure}</Notice>}
      {insights && <div className="space-y-3">
        <p className="text-xs text-slate-500">Consulta em {date(insights.readAt)}. Intervalo solicitado: {date(insights.since)} a {date(insights.until)}. Cada métrica mantém o período informado pelo Threads.</p>
        {insights.metrics.length === 0 && <p>O Threads não retornou resultados para esta consulta.</p>}
        {insights.metrics.map(metric => <div key={metric.name} className="rounded-lg border border-slate-200 p-3">
          <p className="font-medium">{labels[metric.name] ?? metric.name} <span className="text-xs text-slate-500">({metric.period ?? 'período não informado'})</span></p>
          {metric.total !== null && <p>{metric.total.toLocaleString('pt-BR')}</p>}
          {metric.values.map((point, index) => <p key={`${point.endTime}-${index}`} className="text-sm">{point.endTime ? date(point.endTime) : 'Valor informado'}: {point.value.toLocaleString('pt-BR')}</p>)}
          {metric.total === null && metric.values.length === 0 && <p>Sem valor informado.</p>}
        </div>)}
      </div>}
    </div>
  </Sheet>
}

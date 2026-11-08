import { useCallback, useEffect, useState } from 'react'
import { Activity, PauseCircle, PlayCircle, RefreshCw } from 'lucide-react'
import {
  getAutomation,
  listAutomationRuns,
  saveAutomation,
  type AutomationRun,
  type AutomationSettings,
} from '../../../lib/mail'
import { formatDate } from './labels'
import { Field } from './ui'

const JOB_LABEL: Record<string, string> = {
  mailbox_sync: 'Leitura da caixa',
  bounce_scan: 'Tratamento de retornos',
  campaign_send: 'Despacho de campanha',
}

type Props = {
  ok: (mensagem: string) => void
  fail: (erro: unknown, alternativa: string) => void
}

function resumoDaExecucao(run: AutomationRun) {
  const d = run.detail ?? {}
  if (run.status === 'error') return String(d.erro ?? 'falhou')
  if (run.status === 'skipped') return String(d.pulado ?? d.motivo ?? 'nada a fazer')
  if (run.job === 'mailbox_sync') return `${d.lidas ?? 0} mensagens lidas de ${d.total ?? 0} na caixa`
  if (run.job === 'bounce_scan') return `${d.retornos ?? 0} retorno(s), ${d.marcados ?? 0} endereço(s) marcado(s)`
  if (run.job === 'campaign_send') return `${d.campanha ?? 'campanha'}: ${d.sent ?? 0} enviados, ${d.failed ?? 0} falhas, ${d.remaining ?? 0} restantes`
  return JSON.stringify(d).slice(0, 160)
}

/**
 * Painel da automação.
 *
 * O motor roda dentro do servidor, de minuto em minuto. Esta tela é o
 * interruptor, o ritmo e o diário de bordo — inclusive das execuções que não
 * fizeram nada, que são as que explicam "por que não enviou".
 */
function AutomationTab({ ok, fail }: Props) {
  const [settings, setSettings] = useState<AutomationSettings | null>(null)
  const [enviadosHoje, setEnviadosHoje] = useState(0)
  const [travadoPorAmbiente, setTravadoPorAmbiente] = useState(false)
  const [runs, setRuns] = useState<AutomationRun[]>([])
  const [busy, setBusy] = useState('')

  const carregar = useCallback(async () => {
    try {
      const [config, diario] = await Promise.all([getAutomation(), listAutomationRuns(40)])
      setSettings(config.settings)
      setEnviadosHoje(config.sentToday)
      setTravadoPorAmbiente(config.hardDisabled)
      setRuns(diario.runs)
    } catch (caught) {
      fail(caught, 'Falha ao carregar a automação.')
    }
  }, [fail])

  useEffect(() => {
    void carregar()
    const timer = window.setInterval(() => void carregar(), 30_000)
    return () => window.clearInterval(timer)
  }, [carregar])

  async function salvar(patch: Parameters<typeof saveAutomation>[0], recado?: string) {
    setBusy('save')
    try {
      const resultado = await saveAutomation(patch)
      setSettings(resultado.settings)
      if (recado) ok(recado)
      await carregar()
    } catch (caught) {
      fail(caught, 'Não foi possível salvar.')
    } finally {
      setBusy('')
    }
  }

  if (!settings) return <p className="text-sm text-slate-500">Carregando automação…</p>

  const restante = settings.daily_cap === 0 ? '∞' : Math.max(settings.daily_cap - enviadosHoje, 0)

  return (
    <div className="space-y-4">
      {travadoPorAmbiente && (
        <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Automação desligada no servidor por <code>AUTOMATION_DISABLED</code>. O interruptor abaixo não tem efeito
          enquanto essa variável estiver ligada — é o freio de mão do ambiente.
        </p>
      )}

      <section className="flex flex-wrap items-center gap-4 rounded border border-slate-200 bg-white p-4">
        <div className="flex items-center gap-3">
          {settings.enabled ? <PlayCircle className="text-emerald-600" size={28} /> : <PauseCircle className="text-slate-400" size={28} />}
          <div>
            <p className="font-semibold">{settings.enabled ? 'Automação ligada' : 'Automação desligada'}</p>
            <p className="text-xs text-slate-500">
              {settings.enabled
                ? 'O motor lê a caixa, trata retornos e despacha campanha agendada a cada minuto.'
                : 'Nada roda sozinho. Campanha agendada espera aqui até você ligar.'}
            </p>
          </div>
        </div>
        <button
          className={`ml-auto rounded px-4 py-2 text-sm font-medium text-white disabled:opacity-50 ${settings.enabled ? 'bg-red-600' : 'bg-emerald-600'}`}
          onClick={() => void salvar({ enabled: !settings.enabled }, settings.enabled ? 'Automação desligada.' : 'Automação ligada.')}
          disabled={busy === 'save'}
        >
          {settings.enabled ? 'Desligar' : 'Ligar automação'}
        </button>
      </section>

      <section className="grid gap-3 rounded border border-slate-200 bg-white p-4 sm:grid-cols-4">
        <Field
          label="Mensagens por lote"
          type="number"
          value={String(settings.send_batch_size)}
          onChange={(valor) => setSettings({ ...settings, send_batch_size: Number(valor) })}
        />
        <Field
          label="Intervalo entre lotes (s)"
          type="number"
          value={String(settings.send_interval_seconds)}
          onChange={(valor) => setSettings({ ...settings, send_interval_seconds: Number(valor) })}
        />
        <Field
          label="Teto diário (0 = sem teto)"
          type="number"
          value={String(settings.daily_cap)}
          onChange={(valor) => setSettings({ ...settings, daily_cap: Number(valor) })}
        />
        <Field
          label="Ler a caixa a cada (min)"
          type="number"
          value={String(settings.mailbox_sync_minutes)}
          onChange={(valor) => setSettings({ ...settings, mailbox_sync_minutes: Number(valor) })}
        />
        <div className="sm:col-span-4 flex flex-wrap items-center gap-3">
          <button
            className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() =>
              void salvar(
                {
                  sendBatchSize: settings.send_batch_size,
                  sendIntervalSeconds: settings.send_interval_seconds,
                  dailyCap: settings.daily_cap,
                  mailboxSyncMinutes: settings.mailbox_sync_minutes,
                },
                'Ritmo salvo.',
              )
            }
            disabled={busy === 'save'}
          >
            Salvar ritmo
          </button>
          <span className="text-xs text-slate-500">
            Hoje saíram <strong>{enviadosHoje}</strong> · ainda cabem <strong>{restante}</strong>. Domínio novo agradece
            começar baixo: 20 por lote, 20 segundos de intervalo, teto de 200.
          </span>
        </div>
      </section>

      <section className="overflow-hidden rounded border border-slate-200 bg-white">
        <header className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">
          <Activity size={14} /> Diário de bordo
          <button className="ml-auto text-slate-400" onClick={() => void carregar()} aria-label="Atualizar">
            <RefreshCw size={14} />
          </button>
        </header>
        <div className="max-h-96 divide-y divide-slate-100 overflow-auto">
          {runs.map((run) => (
            <div key={run.id} className="flex flex-wrap items-center gap-3 px-4 py-2 text-sm">
              <span className="w-44 shrink-0 text-xs text-slate-400">{formatDate(run.started_at)}</span>
              <span className="w-48 shrink-0 font-medium">{JOB_LABEL[run.job] ?? run.job}</span>
              <span
                className={`rounded px-2 py-0.5 text-xs ${run.status === 'ok' ? 'bg-emerald-50 text-emerald-700' : run.status === 'error' ? 'bg-red-50 text-red-700' : 'bg-slate-100 text-slate-500'}`}
              >
                {run.status === 'ok' ? 'ok' : run.status === 'error' ? 'erro' : 'sem ação'}
              </span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-600">{resumoDaExecucao(run)}</span>
            </div>
          ))}
          {runs.length === 0 && (
            <p className="p-4 text-sm text-slate-500">
              Nenhuma execução ainda. Ligue a automação e o primeiro ciclo aparece aqui em até um minuto.
            </p>
          )}
        </div>
      </section>
    </div>
  )
}

export default AutomationTab

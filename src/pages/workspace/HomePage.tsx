import { CheckCircle2, ChevronRight, Clock, Inbox, KanbanSquare, ListChecks, MessageCircle } from 'lucide-react'
import { useEffect, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import { activationProgress, activationSteps, type ActivationStep } from '../../lib/activation'
import { getPipeline, getTenantSettings, listChannels, listContacts, listConversations, listTasks, listUsers } from '../../lib/crm'
import { formatBRL } from '../../lib/format'
import { useNavigation } from '../../lib/navigationContext'
import { useSession } from '../../lib/session'
import type { Page } from '../../types'

type Today = {
  waiting: number
  unread: number
  openLeads: number
  openValueCents: number
  tasksToday: number
  overdue: number
}

/** Ocultar o checklist é escolha de cada pessoa; o progresso é da conta. */
function hiddenKey(tenantId: string, userId: string) {
  return `agenda:checklist-oculto:${tenantId}:${userId}`
}

function readHidden(key: string) {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function writeHidden(key: string, hidden: boolean) {
  try {
    if (hidden) window.localStorage.setItem(key, '1')
    else window.localStorage.removeItem(key)
  } catch {
    // Navegação privada sem armazenamento: só não lembra a escolha.
  }
}

function sameLocalDay(iso: string, now: Date) {
  const date = new Date(iso)
  return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth() && date.getDate() === now.getDate()
}

/**
 * Início: o que falta para a conta funcionar e o que pede atenção hoje.
 *
 * Substitui a vitrine que estava aqui — "Teste ativo, 12 dias restantes,
 * usuários ilimitados" e três tutoriais com a mesma frase — por números da
 * própria conta. Nada nesta tela é inventado: sem dado, aparece um traço.
 */
export default function HomePage() {
  const { user, canManage } = useSession()
  const { navigate } = useNavigation()
  const key = hiddenKey(user.tenant_id, user.id)
  const [steps, setSteps] = useState<ActivationStep[] | null>(null)
  const [today, setToday] = useState<Today | null>(null)
  const [hidden, setHidden] = useState(() => readHidden(key))

  useEffect(() => {
    let active = true

    if (canManage) {
      Promise.all([listChannels(), listUsers(), listContacts({ page: 1, pageSize: 1 }), getTenantSettings()])
        .then(([channels, users, contacts, settings]) => {
          if (!active) return
          setSteps(
            activationSteps({
              channels: channels.channels,
              activeUsers: users.users.filter((item) => item.active).length,
              contacts: contacts.pagination.total,
              welcomeMessage: settings.settings.welcome_message,
              aiAutonomousReply: settings.settings.ai_autonomous_reply,
            }),
          )
        })
        .catch(() => active && setSteps(null))
    }

    const now = new Date()
    Promise.allSettled([listConversations({ status: 'waiting', page: 1, pageSize: 1 }), getPipeline(), listTasks({ status: 'open' })]).then(
      ([conversations, pipeline, tasks]) => {
        if (!active) return
        const openLeads = pipeline.status === 'fulfilled' ? pipeline.value.leads.filter((lead) => lead.status === 'open') : []
        const openTasks = tasks.status === 'fulfilled' ? tasks.value.tasks : []
        setToday({
          waiting: conversations.status === 'fulfilled' ? conversations.value.pagination.total : Number.NaN,
          unread: conversations.status === 'fulfilled' ? conversations.value.unread?.messages ?? 0 : Number.NaN,
          openLeads: pipeline.status === 'fulfilled' ? openLeads.length : Number.NaN,
          openValueCents: openLeads.reduce((sum, lead) => sum + (lead.value_cents || 0), 0),
          tasksToday: tasks.status === 'fulfilled' ? openTasks.filter((task) => task.due_at && sameLocalDay(task.due_at, now)).length : Number.NaN,
          overdue: openTasks.filter((task) => task.due_at && new Date(task.due_at) < now && !sameLocalDay(task.due_at, now)).length,
        })
      },
    )

    return () => {
      active = false
    }
  }, [canManage])

  const progress = steps ? activationProgress(steps) : null
  const showChecklist = Boolean(steps && progress && !progress.complete && !hidden)
  const firstName = user.name.split(' ')[0]

  function toggleHidden(next: boolean) {
    writeHidden(key, next)
    setHidden(next)
  }

  return (
    <div>
      <Topbar title="Início" />
      <div className={`mx-auto grid max-w-6xl gap-5 p-4 medium:p-6 ${showChecklist ? 'expanded:grid-cols-[minmax(0,1fr)_320px]' : ''}`}>
        <div className="min-w-0 expanded:col-start-1 expanded:row-start-1">
          <h2 className="text-xl font-semibold text-slate-900 medium:text-2xl">Olá, {firstName}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {progress && !progress.complete && hidden ? (
              <button type="button" className="min-h-11 font-semibold text-blue-700 hover:underline" onClick={() => toggleHidden(false)}>
                Mostrar o guia de ativação ({progress.done} de {progress.total})
              </button>
            ) : (
              'O que pede atenção hoje.'
            )}
          </p>
        </div>

        {showChecklist && steps && progress && (
          <section
            aria-labelledby="ativacao-titulo"
            className="min-w-0 rounded-xl border border-slate-200 bg-white p-4 expanded:col-start-2 expanded:row-span-2 expanded:row-start-1 expanded:self-start"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 id="ativacao-titulo" className="font-semibold text-slate-900">Comece por aqui</h2>
                <p className="mt-0.5 text-sm text-slate-500">
                  {progress.done} de {progress.total} concluídos
                </p>
              </div>
              <button type="button" className="min-h-11 shrink-0 rounded-lg px-2 text-sm font-medium text-slate-500 hover:bg-slate-100" onClick={() => toggleHidden(true)}>
                Ocultar
              </button>
            </div>
            <div
              className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100"
              role="progressbar"
              aria-valuemin={0}
              aria-valuemax={progress.total}
              aria-valuenow={progress.done}
              aria-label="Progresso da ativação"
            >
              <div className="h-full rounded-full bg-blue-600 transition-all" style={{ width: `${(progress.done / progress.total) * 100}%` }} />
            </div>
            <ol className="mt-4 space-y-1">
              {steps.map((step, index) => (
                <li key={step.id} className="flex items-start gap-3 rounded-lg py-2">
                  {step.done ? (
                    <CheckCircle2 size={22} className="mt-0.5 shrink-0 text-emerald-600" aria-label="Concluído" />
                  ) : (
                    <span className="mt-0.5 grid size-[22px] shrink-0 place-items-center rounded-full border-2 border-slate-300 text-[11px] font-bold text-slate-500">
                      {index + 1}
                    </span>
                  )}
                  <div className="min-w-0 flex-1">
                    <p className={`text-[15px] font-medium ${step.done ? 'text-slate-500 line-through decoration-slate-300' : 'text-slate-900'}`}>{step.title}</p>
                    {!step.done && (
                      <>
                        <p className="mt-0.5 text-sm leading-snug text-slate-600">{step.outcome}</p>
                        <p className="mt-1 inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock size={12} aria-hidden="true" />
                          {step.duration}
                        </p>
                      </>
                    )}
                  </div>
                  {!step.done && (
                    <button
                      type="button"
                      className="inline-flex min-h-11 shrink-0 items-center rounded-lg bg-blue-600 px-3 text-sm font-semibold text-white hover:bg-blue-700"
                      onClick={() => navigate(step.action.page)}
                    >
                      {step.action.label}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          </section>
        )}

        <div className="min-w-0 expanded:col-start-1 expanded:row-start-2">
          <TodayPanel today={today} navigate={navigate} />
        </div>
      </div>
    </div>
  )
}

function stat(value: number) {
  return Number.isFinite(value) ? String(value) : '—'
}

function TodayPanel({ today, navigate }: { today: Today | null; navigate: (page: Page) => void }) {
  const rows: { label: string; value: string; detail?: string; icon: typeof Inbox; page: Page }[] = [
    {
      label: 'Aguardando resposta',
      value: today ? stat(today.waiting) : '…',
      detail: today && today.unread > 0 ? `${today.unread} mensagem(ns) não lida(s)` : undefined,
      icon: MessageCircle,
      page: 'chat-inbox',
    },
    {
      label: 'Negócios abertos',
      value: today ? stat(today.openLeads) : '…',
      detail: today && Number.isFinite(today.openLeads) ? formatBRL(today.openValueCents / 100) : undefined,
      icon: KanbanSquare,
      page: 'pipeline',
    },
    {
      label: 'Tarefas para hoje',
      value: today ? stat(today.tasksToday) : '…',
      detail: today && today.overdue > 0 ? `${today.overdue} atrasada(s)` : undefined,
      icon: ListChecks,
      page: 'calendar',
    },
  ]

  return (
    <section aria-label="Hoje" className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white medium:grid medium:grid-cols-3 medium:divide-x medium:divide-y-0">
      {rows.map((row) => {
        const Icon = row.icon
        return (
          <button
            key={row.label}
            type="button"
            onClick={() => navigate(row.page)}
            className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50 medium:flex-col medium:items-start medium:gap-2 medium:py-4"
          >
            <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600">
              <Icon size={18} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm text-slate-500">{row.label}</span>
              <span className="block text-2xl font-semibold tabular-nums text-slate-900">{row.value}</span>
              {row.detail && <span className="block truncate text-xs text-slate-500">{row.detail}</span>}
            </span>
            <ChevronRight size={18} className="shrink-0 text-slate-400 medium:hidden" aria-hidden="true" />
          </button>
        )
      })}
    </section>
  )
}

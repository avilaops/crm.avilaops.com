import { useEffect, useRef, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import AiAgentPage from './AiAgentPage'
import MailInbox from './MailInbox'
import NewsletterPage from './newsletter/NewsletterPage'
import ProductsPage from './ProductsPage'
import AutomationsPage from './AutomationsPage'
import SegmentsPage from './SegmentsPage'
import MediaPage from './MediaPage'
import TeamChatPage from './TeamChatPage'
import AllContactsPage from './AllContactsPage'
import CreateLeadModal from '../../components/modals/CreateLeadModal'
import ContactDetailDrawer from '../../components/drawers/ContactDetailDrawer'
import LeadDetailDrawer from '../../components/drawers/LeadDetailDrawer'
import { Archive, CalendarDays, CheckCircle2, Clock, FileText, Paperclip, Plus, RefreshCw, Search, Trash2, X } from 'lucide-react'
import type { LeadSource } from '../../components/modals/LeadSourceModal'
import { createGoogleCalendarUrl } from '../../lib/googleCalendar'
import {
  ApiError,
  archiveConversation,
  assignConversation,
  bootstrap,
  createCompany,
  createLeadFromConversation,
  createTask,
  deleteCompany,
  deleteTask,
  getPipeline,
  listAuditLogs,
  listChannels,
  listCompanies,
  listContacts,
  listConversationMessages,
  listConversations,
  listLeads,
  listTasks,
  listWhatsAppTemplates,
  markConversationRead,
  mediaContentUrl,
  sendConversationMedia,
  sendConversationMessage,
  sendConversationTemplate,
  syncWhatsAppTemplates,
  updateLeadStage,
  updateTask,
  type AuditLogEntry,
  type ConversationFilters,
  type CrmChannel,
  type CrmCompany,
  type CrmContact,
  type CrmConversation,
  type CrmLead,
  type CrmMessage,
  type CrmTask,
  type CrmTemplate,
  type CrmUser,
  type PipelineStage,
} from '../../lib/crm'
import { useRealtime } from '../../lib/realtime'
import type { Page } from '../../types'

function Workspace({ page, setPage, openLeadSource }: { page: Page; setPage: (page: Page) => void; openLeadSource: (source: LeadSource) => void }) {
  if (page === 'home') return <HomePage setPage={setPage} openLeadSource={openLeadSource} />
  if (page === 'chat-inbox') return <ChatInbox openLeadSource={openLeadSource} />
  if (page === 'mail-inbox') return <MailInbox />
  if (page === 'newsletter') return <NewsletterPage />
  if (page === 'team-chat') return <TeamChatPage />
  if (page === 'pipeline') return <Pipeline />
  if (page === 'leads') return <LeadsList />
  if (page === 'calendar') return <TasksPage />
  if (page === 'contacts') return <ContactsList />
  if (page === 'companies') return <CompaniesList />
  if (page === 'audit-logs') return <AuditLogsList />
  if (page === 'all-contacts') return <AllContactsPage />
  if (page === 'media') return <MediaPage />
  if (page === 'products') return <ProductsPage />
  if (page === 'segments') return <SegmentsPage />
  if (page === 'ai-agent') return <AiAgentPage />
  if (page === 'automations') return <AutomationsPage />
  return <HomePage setPage={setPage} openLeadSource={openLeadSource} />
}

function HomePage({ setPage, openLeadSource }: { setPage: (page: Page) => void; openLeadSource: (source: LeadSource) => void }) {
  return (
    <div>
      <Topbar title="Início" />
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <section className="relative overflow-hidden rounded bg-white p-8">
          <button className="absolute right-4 top-4 text-slate-400"><X size={16} /></button>
          <p className="text-sm text-slate-500">Boas-vindas à Agenda!</p>
          <h1 className="mt-3 max-w-md text-3xl font-bold">Converta chats em vendas com IA poderosa</h1>
          <button className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={() => openLeadSource('whatsapp')}>Explore a Agenda</button>
          <div className="absolute right-12 top-8 hidden h-40 w-80 rounded bg-violet-100 p-5 md:block">
            <div className="rounded bg-white px-4 py-2 text-sm">Olá! Gostaria de fazer um pedido</div>
            <div className="mt-8 rounded bg-violet-600 px-4 py-2 text-sm text-white">O agente de IA está preparando uma resposta...</div>
          </div>
        </section>
        <section className="grid gap-5 bg-white p-6 lg:grid-cols-2">
          <div>
            <h3 className="font-semibold">Teste <span className="rounded bg-emerald-100 px-2 py-0.5 text-xs text-emerald-700">Ativo</span></h3>
            <p className="mt-2 text-sm text-slate-500">Seu período de teste oferece acesso completo ao plano Empresarial.</p>
            <button className="mt-24 rounded border border-slate-200 px-3 py-2 text-sm" onClick={() => setPage('billing')}>Ir para Faturamento</button>
          </div>
          <div className="rounded border border-slate-200 p-4">
            <h3 className="font-semibold">Visão geral da área de trabalho</h3>
            {['Dias restantes 12', 'Leads Ilimitado', 'Usuários Ilimitado', 'Contatos & Empresas Ilimitado', 'Números de WhatsApp Ilimitado', 'Espaço de memória 0 / 10 GB'].map((item) => (
              <div key={item} className="flex justify-between border-b border-slate-100 py-2 text-sm text-slate-600">
                <span>{item.split(' ').slice(0, -1).join(' ')}</span>
                <span>{item.split(' ').at(-1)}</span>
              </div>
            ))}
          </div>
        </section>
        <section className="rounded bg-white p-5">
          <h3 className="font-semibold">Tutoriais</h3>
          <div className="mt-4 grid gap-4 md:grid-cols-3">
            <Tutorial title="Conecte um canal" button="Conectar canal" onClick={() => openLeadSource('whatsapp')} />
            <Tutorial title="Crie uma recepcionista com IA" button="Criar recepcionista com IA" />
            <Tutorial title="Crie um bot de boas-vindas" button="Criar bot" />
          </div>
        </section>
      </div>
    </div>
  )
}

function Tutorial({ title, button, onClick }: { title: string; button: string; onClick?: () => void }) {
  return (
    <div className="rounded border border-slate-200 p-4">
      <div className="mb-4 h-4 w-4 rounded-full border border-slate-300" />
      <h4 className="font-medium">{title}</h4>
      <p className="mt-2 text-sm text-slate-500">Comece a receber mensagens direto na Agenda.</p>
      <button className="mt-4 rounded bg-blue-600 px-3 py-2 text-xs font-semibold text-white" onClick={onClick}>{button}</button>
    </div>
  )
}

function ChatInbox({ openLeadSource }: { openLeadSource: (source: LeadSource) => void }) {
  const [conversations, setConversations] = useState<CrmConversation[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [messages, setMessages] = useState<CrmMessage[]>([])
  const [channels, setChannels] = useState<CrmChannel[]>([])
  const [users, setUsers] = useState<CrmUser[]>([])
  const [filters, setFilters] = useState<ConversationFilters>({ page: 1, pageSize: 30 })
  const [total, setTotal] = useState(0)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingLead, setCreatingLead] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [templates, setTemplates] = useState<CrmTemplate[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [syncingTemplates, setSyncingTemplates] = useState(false)
  // Avanca o relogio para o contador da janela andar sozinho; sem isso o
  // "faltam 3h" congela ate a proxima interacao do atendente.
  const [now, setNow] = useState(() => Date.now())
  const fileInput = useRef<HTMLInputElement>(null)
  const messagesEnd = useRef<HTMLDivElement>(null)
  // Espelhos para os callbacks do SSE: eles sao recriados a cada render, mas
  // executam com o estado do instante em que o evento chega.
  const selectedIdRef = useRef<string | null>(null)
  selectedIdRef.current = selectedId
  const conversationsRef = useRef<CrmConversation[]>([])
  const refreshTimer = useRef<number | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const refresh = (nextFilters = filters) => {
    setLoading(true)
    listConversations(nextFilters)
      .then((data) => {
        setConversations(data.conversations)
        setTotal(data.pagination.total)
        setUnreadTotal(data.unread?.messages ?? 0)
        setSelectedId((current) => current && data.conversations.some((item) => item.id === current) ? current : data.conversations[0]?.id ?? null)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    let active = true
    Promise.all([listConversations({ page: 1, pageSize: 30 }), listChannels(), bootstrap()])
      .then(([data, channelData, boot]) => {
        if (!active) return
        setConversations(data.conversations)
        setTotal(data.pagination.total)
        setUnreadTotal(data.unread?.messages ?? 0)
        setChannels(channelData.channels)
        setUsers(boot.users)
        setSelectedId(data.conversations[0]?.id ?? null)
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    const timeout = window.setTimeout(() => refresh(filters), 250)
    return () => window.clearTimeout(timeout)
  }, [filters])

  useEffect(() => {
    const tick = window.setInterval(() => setNow(Date.now()), 30_000)
    return () => {
      window.clearInterval(tick)
      if (refreshTimer.current !== null) window.clearTimeout(refreshTimer.current)
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let active = true
    setTemplateOpen(false)
    listConversationMessages(selectedId)
      .then((data) => active && setMessages(data.messages))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [selectedId])

  useEffect(() => {
    messagesEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages])

  /** Aplica no estado o que o servidor acabou de empurrar. */
  const { connected } = useRealtime((event) => {
    if (event.type === 'conversation.read') {
      patchConversation(event.conversationId, { unread_count: 0 })
      return
    }

    if (event.type === 'conversation.updated') {
      const data = (event.data ?? {}) as Partial<CrmConversation>
      // Uma conversa que ainda nao esta na pagina atual so entra pela
      // listagem: ela pode estar fora do filtro ou da pagina em foco.
      setConversations((items) =>
        items.some((item) => item.id === event.conversationId)
          ? items.map((item) => (item.id === event.conversationId ? { ...item, ...data } : item))
          : items,
      )
      // Conversa fora da pagina atual: so a listagem sabe se ela entra no
      // filtro. O agendamento evita uma busca por evento quando a fila esta
      // movimentada e a maior parte dos eventos e de conversas nao exibidas.
      if (!conversationsRef.current.some((item) => item.id === event.conversationId)) scheduleRefresh()
      return
    }

    if (event.type === 'message.updated') {
      const data = (event.data ?? {}) as Partial<CrmMessage> & { id?: string }
      const conversationId = event.conversationId
      if (!data.id || !conversationId || conversationId !== selectedIdRef.current) return
      if (event.truncated) {
        // O evento nao coube no transporte: busca o estado real em vez de
        // mostrar um pedaco da mensagem.
        listConversationMessages(conversationId).then((fresh) => setMessages(fresh.messages)).catch(() => {})
        return
      }
      setMessages((items) => items.map((item) => (item.id === data.id ? { ...item, ...data } : item)))
      return
    }

    if (event.type === 'message.created') {
      const conversationId = event.conversationId
      if (!conversationId) return
      const message = (event.data ?? null) as CrmMessage | null

      if (conversationId === selectedIdRef.current) {
        if (event.truncated || !message) {
          listConversationMessages(conversationId).then((fresh) => setMessages(fresh.messages)).catch(() => {})
        } else {
          // Dedupe por id: quem enviou ja inseriu a mensagem na resposta do
          // POST e recebe o mesmo evento de volta pelo SSE.
          setMessages((items) => (items.some((item) => item.id === message.id) ? items : [...items, message]))
        }
        if (message?.direction === 'inbound') {
          markConversationRead(conversationId).catch(() => {})
          patchConversation(conversationId, { unread_count: 0 })
        }
      }

      bumpConversation(conversationId, message)
    }
  })

  conversationsRef.current = conversations

  /** Junta varios eventos seguidos numa unica releitura da lista. */
  function scheduleRefresh() {
    if (refreshTimer.current !== null) return
    refreshTimer.current = window.setTimeout(() => {
      refreshTimer.current = null
      refresh(filters)
    }, 2_000)
  }

  function patchConversation(conversationId: string | null | undefined, patch: Partial<CrmConversation>) {
    if (!conversationId) return
    setConversations((items) => items.map((item) => (item.id === conversationId ? { ...item, ...patch } : item)))
  }

  /** Move a conversa para o topo e atualiza o resumo da lista. */
  function bumpConversation(conversationId: string, message: CrmMessage | null) {
    setConversations((items) => {
      const index = items.findIndex((item) => item.id === conversationId)
      if (index === -1) return items
      const current = items[index]
      const isInbound = message?.direction === 'inbound'
      const updated: CrmConversation = {
        ...current,
        last_message_at: message?.sent_at ?? current.last_message_at,
        status: isInbound ? 'waiting' : current.status === 'waiting' ? 'open' : current.status,
        last_customer_message_at: isInbound ? message?.sent_at ?? current.last_customer_message_at : current.last_customer_message_at,
        window_open: isInbound ? true : current.window_open,
        window_expires_at: isInbound && message?.sent_at
          ? new Date(new Date(message.sent_at).getTime() + 24 * 60 * 60 * 1000).toISOString()
          : current.window_expires_at,
        unread_count: isInbound && conversationId !== selectedIdRef.current ? current.unread_count + 1 : current.unread_count,
      }
      if (isInbound && conversationId !== selectedIdRef.current) setUnreadTotal((value) => value + 1)
      // A lista vem ordenada por ultima mensagem: quem acabou de falar sobe.
      return [updated, ...items.filter((_, position) => position !== index)]
    })
  }

  function handleSelect(conversationId: string) {
    setSelectedId(conversationId)
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation || conversation.unread_count === 0) return
    setUnreadTotal((value) => Math.max(0, value - conversation.unread_count))
    patchConversation(conversationId, { unread_count: 0 })
    markConversationRead(conversationId).catch(() => {})
  }

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const waitingCount = conversations.filter((conversation) => conversation.status === 'waiting').length
  const selectedAssignee = selected?.assigned_user_id ?? ''
  const windowState = describeWindow(selected, now)

  async function handleAssign(userId: string) {
    if (!selected) return
    await assignConversation(selected.id, userId || null)
    refresh()
  }

  async function loadTemplates() {
    setTemplateOpen(true)
    if (templates.length > 0) return
    try {
      const data = await listWhatsAppTemplates(true)
      setTemplates(data.templates)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  async function handleSyncTemplates() {
    setSyncingTemplates(true)
    setError('')
    try {
      const result = await syncWhatsAppTemplates()
      const data = await listWhatsAppTemplates(true)
      setTemplates(data.templates)
      setError(`${result.total} template(s) sincronizado(s) com a Meta.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncingTemplates(false)
    }
  }

  async function handleSend() {
    if (!selected || !reply.trim()) return
    setSending(true)
    setError('')
    try {
      const result = await sendConversationMessage(selected.id, reply.trim())
      setMessages((items) => (items.some((item) => item.id === result.message.id) ? items : [...items, result.message]))
      setReply('')
    } catch (err) {
      // 409 com `window_closed`: a Meta nao aceita texto livre depois de 24h.
      // Em vez de so mostrar o erro, a tela ja abre o caminho que funciona.
      if (err instanceof ApiError && err.code === 'window_closed') {
        patchConversation(selected.id, { window_open: false })
        setError(err.message)
        await loadTemplates()
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setSending(false)
    }
  }

  async function handleAttach(file: File | undefined) {
    if (!selected || !file) return
    setUploading(true)
    setError('')
    try {
      const result = await sendConversationMedia(selected.id, file, reply.trim() || undefined)
      setMessages((items) => (items.some((item) => item.id === result.message.id) ? items : [...items, result.message]))
      setReply('')
    } catch (err) {
      if (err instanceof ApiError && err.code === 'window_closed') {
        patchConversation(selected.id, { window_open: false })
        setError(err.message)
        await loadTemplates()
      } else {
        setError(err instanceof Error ? err.message : String(err))
      }
    } finally {
      setUploading(false)
      if (fileInput.current) fileInput.current.value = ''
    }
  }

  async function handleSendTemplate(template: CrmTemplate, variables: string[]) {
    if (!selected) return
    setSending(true)
    setError('')
    try {
      const result = await sendConversationTemplate(selected.id, template.id, variables)
      setMessages((items) => (items.some((item) => item.id === result.message.id) ? items : [...items, result.message]))
      setTemplateOpen(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSending(false)
    }
  }

  async function handleCreateLead() {
    if (!selected) return
    setCreatingLead(true)
    setError('')
    try {
      await createLeadFromConversation(selected.id)
      setError('Lead criado e vinculado ao contato da conversa.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingLead(false)
    }
  }

  return (
    <div>
      <Topbar title="Caixa de entrada" />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="space-y-3 border-b border-slate-200 p-4">
            <span className="rounded bg-lime-100 px-2 py-1 text-xs text-lime-700">Conversas abertas</span>
            <span className="float-right text-xs text-slate-400">Total: {total}</span>
            <div className="flex items-center gap-3 text-xs">
              <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-emerald-600' : 'text-slate-400'}`} title={connected ? 'Recebendo mensagens em tempo real' : 'Reconectando ao fluxo em tempo real'}>
                <span className={`h-2 w-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {connected ? 'Ao vivo' : 'Reconectando'}
              </span>
              {unreadTotal > 0 && <span className="font-semibold text-blue-600">{unreadTotal} não lida(s)</span>}
            </div>
            {waitingCount > 0 && <p className="text-xs font-semibold text-amber-600">{waitingCount} cliente(s) aguardando resposta</p>}
            <input
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none"
              placeholder="Buscar contato, telefone, empresa, mensagem..."
              value={filters.search ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
            />
            <div className="grid grid-cols-2 gap-2">
              <select className="rounded border border-slate-200 px-2 py-2 text-xs" value={filters.status ?? ''} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined, page: 1 }))}>
                <option value="">Todos status</option>
                <option value="waiting">Aguardando</option>
                <option value="open">Aberto</option>
                <option value="archived">Arquivado</option>
              </select>
              <select className="rounded border border-slate-200 px-2 py-2 text-xs" value={filters.channelId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, channelId: event.target.value || undefined, page: 1 }))}>
                <option value="">Todos canais</option>
                {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.phone_number ?? channel.display_name}</option>)}
              </select>
              <select className="rounded border border-slate-200 px-2 py-2 text-xs" value={filters.assignedUserId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value || undefined, unassigned: undefined, page: 1 }))}>
                <option value="">Todos atendentes</option>
                {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
              </select>
              <button className={`rounded border px-2 py-2 text-xs ${filters.unassigned ? 'border-blue-500 bg-blue-50 text-blue-700' : 'border-slate-200'}`} onClick={() => setFilters((current) => ({ ...current, unassigned: !current.unassigned, assignedUserId: undefined, page: 1 }))}>
                Sem responsável
              </button>
              <button className={`rounded border px-2 py-2 text-xs ${filters.slaOverdue ? 'border-amber-500 bg-amber-50 text-amber-700' : 'border-slate-200'}`} onClick={() => setFilters((current) => ({ ...current, slaOverdue: !current.slaOverdue, page: 1 }))}>
                SLA vencido
              </button>
              <button className="rounded border border-slate-200 px-2 py-2 text-xs" onClick={() => setFilters({ page: 1, pageSize: 30 })}>
                Limpar
              </button>
            </div>
          </div>
          <button className="flex w-full gap-4 border-b border-slate-100 p-4 text-left" onClick={() => openLeadSource('whatsapp')}>
            <span className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-slate-400">
              <Plus size={18} />
            </span>
            <span>
              <span className="block font-semibold">Adicionar canais</span>
              <span className="text-sm text-slate-500">Capture leads do WhatsApp & mais!</span>
            </span>
          </button>
          {loading && <p className="p-8 text-center text-sm text-slate-400">Carregando conversas...</p>}
          {error && <p className="p-4 text-sm text-red-500">{error}</p>}
          {!loading && conversations.length === 0 && <p className="p-8 text-center text-sm text-slate-400">Nenhuma conversa encontrada</p>}
          <div className="divide-y divide-slate-100">
            {conversations.map((conversation) => (
              <button
                key={conversation.id}
                className={`block w-full p-4 text-left ${conversation.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                onClick={() => handleSelect(conversation.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="relative shrink-0">
                    <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-xs font-bold">
                      {(conversation.contact_name ?? conversation.contact_phone ?? '?').slice(0, 2).toUpperCase()}
                    </div>
                    {conversation.unread_count > 0 && (
                      <span className="absolute -right-1 -top-1 grid h-5 min-w-5 place-items-center rounded-full bg-blue-600 px-1 text-[10px] font-bold text-white">
                        {conversation.unread_count > 99 ? '99+' : conversation.unread_count}
                      </span>
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className={`truncate ${conversation.unread_count > 0 ? 'font-bold' : 'font-semibold'}`}>{conversation.contact_name ?? conversation.contact_phone ?? 'Contato sem nome'}</p>
                      <StatusPill status={conversation.status} />
                    </div>
                    <p className="truncate text-sm text-slate-500">{conversation.channel_name ?? 'WhatsApp'} {conversation.channel_phone ? `- ${conversation.channel_phone}` : ''}</p>
                    <p className="mt-1 text-xs text-slate-400">
                      {conversation.unassigned ? 'Sem responsável' : conversation.assigned_user_name ?? 'Responsável definido'}
                      {conversation.waiting_seconds > 0 ? ` · aguardando ${formatWait(conversation.waiting_seconds)}` : ''}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </aside>
        <section className="relative bg-slate-50">
          {!selected ? (
            <div className="grid h-full place-items-center">
              <div className="max-w-lg text-center text-slate-600">
                <p>Conecte seus canais para receber e responder a todas as mensagens em um só lugar.</p>
                <div className="mt-5 flex flex-wrap justify-center gap-2">
                  <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" onClick={() => openLeadSource('whatsapp')}>Conectar WhatsApp</button>
                  <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Conectar TikTok</button>
                  <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" onClick={() => openLeadSource('instagram')}>Conectar Instagram</button>
                  <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Conectar Facebook</button>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col">
              <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-5">
                <div
                  className={selected.contact_id ? 'cursor-pointer group' : ''}
                  onClick={() => selected.contact_id && setSelectedContactId(selected.contact_id)}
                >
                  <h3 className="font-semibold text-slate-900 group-hover:text-blue-600 transition flex items-center gap-1.5">
                    {selected.contact_name ?? selected.contact_phone ?? 'Contato'}
                    {selected.contact_id && (
                      <span className="rounded border border-blue-200 bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-600">
                        Ver Ficha
                      </span>
                    )}
                  </h3>
                  <p className="text-xs text-slate-500">{selected.channel_name ?? 'WhatsApp'} · {selected.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  {windowState.label && (
                    <span className={`inline-flex items-center gap-1.5 rounded px-2.5 py-1.5 text-xs font-semibold ${windowState.tone}`} title={windowState.hint}>
                      <Clock size={13} />
                      {windowState.label}
                    </span>
                  )}
                  <select className="rounded border border-slate-200 px-3 py-2 text-sm" value={selectedAssignee} onChange={(event) => handleAssign(event.target.value)}>
                    <option value="">Sem responsável</option>
                    {users.map((user) => <option key={user.id} value={user.id}>{user.name}</option>)}
                  </select>
                  <button
                    className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-semibold"
                    onClick={() => archiveConversation(selected.id).then(() => patchConversation(selected.id, { status: 'archived' }))}
                  >
                    <Archive size={15} />
                    Arquivar
                  </button>
                  <button className="rounded bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={creatingLead} onClick={handleCreateLead}>
                    {creatingLead ? 'Criando...' : 'Criar lead'}
                  </button>
                </div>
              </div>
              <div className="flex-1 space-y-3 overflow-auto p-5">
                {messages.length === 0 && <p className="mt-12 text-center text-sm text-slate-400">Nenhuma mensagem gravada para esta conversa.</p>}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEnd} />
              </div>
              <div className="border-t border-slate-200 bg-white p-4">
                {templateOpen || !windowState.canSendFreeText ? (
                  <TemplateComposer
                    templates={templates}
                    sending={sending}
                    syncing={syncingTemplates}
                    blocked={!windowState.canSendFreeText}
                    onSync={handleSyncTemplates}
                    onSend={handleSendTemplate}
                    onClose={windowState.canSendFreeText ? () => setTemplateOpen(false) : undefined}
                  />
                ) : (
                  <>
                    <textarea className="h-20 w-full resize-none rounded border border-slate-200 p-3 text-sm outline-none" value={reply} onChange={(event) => setReply(event.target.value)} placeholder="Responder pelo WhatsApp..." />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInput}
                          type="file"
                          className="hidden"
                          onChange={(event) => handleAttach(event.target.files?.[0])}
                        />
                        <button
                          className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-semibold disabled:opacity-60"
                          disabled={uploading || selected.channel_provider !== 'whatsapp'}
                          title={selected.channel_provider !== 'whatsapp' ? 'Anexos disponíveis apenas na API oficial do WhatsApp' : 'Anexar arquivo'}
                          onClick={() => fileInput.current?.click()}
                        >
                          <Paperclip size={15} />
                          {uploading ? 'Enviando anexo...' : 'Anexar'}
                        </button>
                        {selected.channel_provider === 'whatsapp' && (
                          <button className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-semibold" onClick={loadTemplates}>
                            <FileText size={15} />
                            Template
                          </button>
                        )}
                      </div>
                      <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" disabled={sending || !reply.trim()} onClick={handleSend}>
                        {sending ? 'Enviando...' : 'Enviar resposta'}
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </section>
      </div>

      {selectedContactId && (
        <ContactDetailDrawer
          contactId={selectedContactId}
          onClose={() => setSelectedContactId(null)}
          onUpdated={() => refresh()}
        />
      )}
    </div>
  )
}

/**
 * Traduz a janela de 24h para o que a tela precisa decidir.
 *
 * O backend ja recusa o texto livre fora da janela; aqui a conta serve para
 * avisar antes de o atendente escrever, nao para autorizar o envio.
 */
function describeWindow(conversation: CrmConversation | null, now: number) {
  if (!conversation || conversation.channel_provider !== 'whatsapp') {
    return { canSendFreeText: true, label: '', tone: '', hint: '' }
  }
  if (!conversation.window_expires_at) {
    return {
      canSendFreeText: false,
      label: 'Sem janela aberta',
      tone: 'bg-slate-100 text-slate-600',
      hint: 'O cliente ainda não escreveu. Só um template aprovado inicia a conversa.',
    }
  }
  const remaining = Math.floor((new Date(conversation.window_expires_at).getTime() - now) / 1000)
  if (remaining <= 0) {
    return {
      canSendFreeText: false,
      label: 'Janela fechada',
      tone: 'bg-red-100 text-red-700',
      hint: 'Passaram-se 24h da última mensagem do cliente. Use um template aprovado.',
    }
  }
  const hours = Math.floor(remaining / 3600)
  const minutes = Math.floor((remaining % 3600) / 60)
  return {
    canSendFreeText: true,
    label: hours > 0 ? `Janela: ${hours}h${minutes > 0 ? ` ${minutes}min` : ''}` : `Janela: ${minutes}min`,
    tone: hours < 2 ? 'bg-amber-100 text-amber-700' : 'bg-emerald-100 text-emerald-700',
    hint: 'Tempo restante para responder com texto livre pela API oficial.',
  }
}

function MessageBubble({ message }: { message: CrmMessage }) {
  const inbound = message.direction === 'inbound'
  // Mensagem com anexo entra no banco com o marcador "[image]" vindo do
  // webhook; ao lado da imagem ele nao informa nada. A legenda real do cliente
  // vive no anexo.
  const marcador = /^\[[a-z_]+\]$/i.test(message.body ?? '')
  const texto = message.media_id && marcador ? message.media_caption ?? '' : message.body ?? ''
  return (
    <div className={`flex ${inbound ? 'justify-start' : 'justify-end'}`}>
      <div className={`max-w-[72%] rounded px-4 py-3 text-sm shadow-sm ${inbound ? 'bg-white' : 'bg-blue-600 text-white'}`}>
        {message.media_id && <MessageAttachment message={message} />}
        {texto && <p className={message.media_id ? 'mt-2 whitespace-pre-wrap' : 'whitespace-pre-wrap'}>{texto}</p>}
        {!texto && !message.media_id && <p className="italic opacity-70">[sem conteúdo]</p>}
        <p className={`mt-2 text-xs ${inbound ? 'text-slate-400' : 'text-blue-100'}`}>
          {new Date(message.sent_at).toLocaleString('pt-BR')} · {message.message_type === 'template' ? 'template · ' : ''}{message.status}
        </p>
        {message.error_message && <p className="mt-1 text-xs text-red-500">{message.error_message}</p>}
      </div>
    </div>
  )
}

/** Renderiza o anexo pelo mime: imagem, áudio e vídeo abrem no lugar. */
function MessageAttachment({ message }: { message: CrmMessage }) {
  if (message.media_status === 'pending') {
    return <p className="rounded bg-black/5 px-3 py-2 text-xs italic">Baixando anexo...</p>
  }
  if (message.media_status === 'failed' || !message.media_id) {
    return <p className="rounded bg-black/5 px-3 py-2 text-xs italic">Anexo indisponível.</p>
  }

  const url = mediaContentUrl(message.media_id)
  const mime = message.media_mime_type ?? ''

  if (mime.startsWith('image/')) {
    return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt={message.media_file_name ?? 'Anexo'} className="max-h-72 rounded" /></a>
  }
  if (mime.startsWith('audio/')) {
    return <audio controls src={url} className="w-64" />
  }
  if (mime.startsWith('video/')) {
    return <video controls src={url} className="max-h-72 rounded" />
  }
  return (
    <a href={url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded bg-black/10 px-3 py-2 text-xs font-semibold underline">
      <FileText size={14} />
      {message.media_file_name ?? 'Baixar anexo'}
    </a>
  )
}

/**
 * Seletor de templates.
 *
 * Aparece sozinho quando a janela fecha: naquele momento e a unica forma de
 * falar com o cliente, e esconder isso atras de um menu custaria o contato.
 */
function TemplateComposer({
  templates,
  sending,
  syncing,
  blocked,
  onSync,
  onSend,
  onClose,
}: {
  templates: CrmTemplate[]
  sending: boolean
  syncing: boolean
  blocked: boolean
  onSync: () => void
  onSend: (template: CrmTemplate, variables: string[]) => void
  onClose?: () => void
}) {
  const [templateId, setTemplateId] = useState('')
  const [variables, setVariables] = useState<string[]>([])
  const chosen = templates.find((template) => template.id === templateId) ?? null

  function pick(id: string) {
    setTemplateId(id)
    const template = templates.find((item) => item.id === id)
    setVariables(Array.from({ length: template?.variable_count ?? 0 }, () => ''))
  }

  const ready = Boolean(chosen) && variables.every((value) => value.trim().length > 0)
  const preview = chosen?.body_text?.replace(/\{\{\s*(\d+)\s*\}\}/g, (_match, index: string) => variables[Number(index) - 1] || `{{${index}}}`)

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className={`text-xs font-semibold ${blocked ? 'text-amber-700' : 'text-slate-600'}`}>
          {blocked ? 'Fora da janela de 24h: só um template aprovado chega ao cliente.' : 'Enviar um template aprovado'}
        </p>
        <div className="flex items-center gap-2">
          <button className="inline-flex items-center gap-1.5 rounded border border-slate-200 px-2.5 py-1.5 text-xs font-semibold disabled:opacity-60" disabled={syncing} onClick={onSync}>
            <RefreshCw size={13} />
            {syncing ? 'Sincronizando...' : 'Sincronizar'}
          </button>
          {onClose && (
            <button className="rounded border border-slate-200 px-2.5 py-1.5 text-xs font-semibold" onClick={onClose}>
              <X size={13} />
            </button>
          )}
        </div>
      </div>

      {templates.length === 0 ? (
        <p className="rounded border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
          Nenhum template aprovado sincronizado. Use "Sincronizar" para buscar os templates da sua conta na Meta.
        </p>
      ) : (
        <>
          <select className="w-full rounded border border-slate-200 px-3 py-2 text-sm" value={templateId} onChange={(event) => pick(event.target.value)}>
            <option value="">Escolha um template...</option>
            {templates.map((template) => (
              <option key={template.id} value={template.id}>{template.name} ({template.language}){template.category ? ` · ${template.category}` : ''}</option>
            ))}
          </select>

          {chosen && variables.length > 0 && (
            <div className="grid gap-2">
              {variables.map((value, index) => (
                <input
                  key={index}
                  className="w-full rounded border border-slate-200 px-3 py-2 text-sm"
                  placeholder={`Variável {{${index + 1}}}`}
                  value={value}
                  onChange={(event) => setVariables((current) => current.map((item, position) => (position === index ? event.target.value : item)))}
                />
              ))}
            </div>
          )}

          {chosen && <p className="rounded bg-slate-50 p-3 text-sm text-slate-700 whitespace-pre-wrap">{preview}</p>}

          <div className="flex justify-end">
            <button
              className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
              disabled={!ready || sending}
              onClick={() => chosen && onSend(chosen, variables)}
            >
              {sending ? 'Enviando...' : 'Enviar template'}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

function StatusPill({ status }: { status: string }) {
  const label = status === 'waiting' ? 'Aguardando' : status === 'archived' ? 'Arquivado' : 'Aberto'
  const color = status === 'waiting' ? 'bg-amber-100 text-amber-700' : status === 'archived' ? 'bg-slate-100 text-slate-600' : 'bg-emerald-100 text-emerald-700'
  return <span className={`shrink-0 rounded px-2 py-0.5 text-xs font-semibold ${color}`}>{label}</span>
}

function formatWait(seconds: number) {
  if (seconds < 60) return `${seconds}s`
  const minutes = Math.floor(seconds / 60)
  if (minutes < 60) return `${minutes}min`
  return `${Math.floor(minutes / 60)}h`
}

function TableMessage({ colSpan, text }: { colSpan: number; text: string }) {
  return <tr><td className="px-4 py-6 text-slate-400" colSpan={colSpan}>{text}</td></tr>
}

function formatCurrency(valueCents: number) {
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(valueCents / 100)
}


function Pipeline() {
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createDefaultStageId, setCreateDefaultStageId] = useState<string | undefined>(undefined)

  const loadPipeline = () => {
    setLoading(true)
    Promise.all([
      getPipeline(),
      listContacts({ page: 1, pageSize: 100 }),
      listCompanies({ page: 1, pageSize: 100 }),
    ])
      .then(([pipelineData, contactsData, companiesData]) => {
        setStages(pipelineData.stages)
        setLeads(pipelineData.leads)
        setContacts(contactsData.contacts)
        setCompanies(companiesData.companies)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadPipeline()
  }, [])

  const handleStageChange = async (leadId: string, newStageId: string) => {
    try {
      await updateLeadStage(leadId, newStageId)
      setLeads((prev) => prev.map((l) => (l.id === leadId ? { ...l, stage_id: newStageId } : l)))
      if (selectedLead?.id === leadId) {
        setSelectedLead((prev) => (prev ? { ...prev, stage_id: newStageId } : null))
      }
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao mover lead.')
    }
  }

  const totalValueCents = leads.reduce((acc, l) => acc + (l.value_cents || 0), 0)

  return (
    <div>
      <Topbar
        title="Funil de Vendas & Oportunidades"
        tab={`${formatCurrency(totalValueCents)} · ${leads.length} oportunidade(s)`}
        action="+ Nova Oportunidade"
        onAction={() => {
          setCreateDefaultStageId(stages[0]?.id)
          setShowCreateModal(true)
        }}
      />

      <div className="overflow-auto p-5">
        {error && (
          <p className="mb-4 rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </p>
        )}

        <div
          className="grid min-w-[980px] gap-4 rounded bg-white p-4"
          style={{ gridTemplateColumns: `repeat(${Math.max(stages.length, 1)}, minmax(240px, 1fr))` }}
        >
          {loading && <p className="p-4 text-sm text-slate-400">Carregando funil...</p>}
          {!loading &&
            stages.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage_id === stage.id)
              const stageValue = stageLeads.reduce((acc, l) => acc + (l.value_cents || 0), 0)
              return (
                <div key={stage.id} className="min-h-[560px] rounded-xl border border-slate-200 bg-slate-50/60 p-3 flex flex-col justify-between">
                  <div>
                    <div
                      className="border-b-2 pb-2.5 flex items-center justify-between"
                      style={{ borderColor: stage.color }}
                    >
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          {stage.name}
                        </h4>
                        <p className="text-[10px] font-semibold text-slate-400">
                          {formatCurrency(stageValue)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {stageLeads.map((lead) => (
                        <LeadCard
                          key={lead.id}
                          lead={lead}
                          stages={stages}
                          onStageChange={handleStageChange}
                          onClick={() => setSelectedLead(lead)}
                        />
                      ))}
                    </div>

                    {stageLeads.length === 0 && (
                      <p className="p-6 text-center text-xs text-slate-400">Sem leads nesta etapa.</p>
                    )}
                  </div>

                  <button
                    className="mt-3 w-full rounded-lg border border-dashed border-slate-300 py-2 text-center text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800 transition"
                    onClick={() => {
                      setCreateDefaultStageId(stage.id)
                      setShowCreateModal(true)
                    }}
                  >
                    + Adicionar nesta etapa
                  </button>
                </div>
              )
            })}
        </div>
      </div>

      {/* Modal de Criação de Lead */}
      {showCreateModal && (
        <CreateLeadModal
          stages={stages}
          defaultStageId={createDefaultStageId}
          contacts={contacts}
          companies={companies}
          onClose={() => setShowCreateModal(false)}
          onCreated={(newLead) => {
            setLeads((prev) => [newLead, ...prev])
          }}
        />
      )}

      {/* Ficha Lateral do Lead */}
      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          stages={stages}
          onClose={() => setSelectedLead(null)}
          onUpdated={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
            setSelectedLead(updated)
          }}
          onDeleted={(deletedId) => {
            setLeads((prev) => prev.filter((l) => l.id !== deletedId))
            setSelectedLead(null)
          }}
          onOpenContact={(cId) => {
            setSelectedContactId(cId)
          }}
        />
      )}

      {/* Ficha Lateral do Contato */}
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

function LeadCard({
  lead,
  stages,
  onStageChange,
  onClick,
}: {
  lead: CrmLead
  stages: PipelineStage[]
  onStageChange: (leadId: string, stageId: string) => void
  onClick: () => void
}) {
  const name = lead.contact_name ?? lead.title
  return (
    <div
      onClick={onClick}
      className="cursor-pointer rounded-xl border border-slate-200 bg-white p-3.5 shadow-sm hover:border-blue-400 hover:shadow-md transition"
    >
      <div className="flex gap-3 items-start">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-blue-100 text-blue-700 text-xs font-bold">
          {name[0]?.toUpperCase() ?? 'L'}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold text-slate-900">{name}</p>
          <p className="truncate text-xs font-medium text-blue-600">{lead.title}</p>
          <p className="mt-1 text-xs font-extrabold text-slate-800">{formatCurrency(lead.value_cents)}</p>

          <div
            className="mt-2.5 flex items-center justify-between gap-1"
            onClick={(e) => e.stopPropagation()}
          >
            <select
              className="w-full rounded-md border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-semibold text-slate-700 outline-none hover:bg-slate-100"
              value={lead.stage_id ?? ''}
              onChange={(e) => onStageChange(lead.id, e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  Mover: {s.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>
    </div>
  )
}

function CompaniesList() {
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState({ name: '', cnpj: '', domain: '', phone: '', email: '', address: '' })
  const [saving, setSaving] = useState(false)

  const loadCompanies = () => {
    setLoading(true)
    listCompanies({ search, page: 1, pageSize: 50 })
      .then((data) => {
        setCompanies(data.companies)
        setTotal(data.pagination.total)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true)
      listCompanies({ search, page: 1, pageSize: 50 })
        .then((data) => {
          setCompanies(data.companies)
          setTotal(data.pagination.total)
          setError('')
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  const handleCreateCompany = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      await createCompany(form)
      setShowModal(false)
      setForm({ name: '', cnpj: '', domain: '', phone: '', email: '', address: '' })
      loadCompanies()
    } catch (err: any) {
      alert(err.message || 'Falha ao cadastrar empresa.')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteCompany = async (id: string) => {
    if (!confirm('Deseja realmente remover esta empresa?')) return
    try {
      await deleteCompany(id)
      loadCompanies()
    } catch (err: any) {
      alert(err.message || 'Falha ao deletar empresa.')
    }
  }

  return (
    <div>
      <Topbar title="Empresas" tab={`${total} empresa(s)`} action="+ Nova Empresa" onAction={() => setShowModal(true)} />
      <div className="space-y-4 p-5">
        <input className="w-full max-w-md rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar empresas por nome, CNPJ, site ou email..." />
        {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <DataTable columns={['Empresa', 'CNPJ', 'Domínio / Site', 'Telefone', 'E-mail', 'Contatos Vinculados', 'Ações']}>
          {loading && <TableMessage colSpan={7} text="Carregando empresas..." />}
          {!loading && companies.length === 0 && <TableMessage colSpan={7} text="Nenhuma empresa cadastrada." />}
          {companies.map((company) => (
            <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="px-4 py-3 font-semibold text-slate-900">{company.name}</td>
              <td className="px-4 py-3 text-slate-600">{company.cnpj || '-'}</td>
              <td className="px-4 py-3 text-blue-600 font-medium">{company.domain ? <a href={company.domain.startsWith('http') ? company.domain : `https://${company.domain}`} target="_blank" rel="noreferrer" className="underline">{company.domain}</a> : '-'}</td>
              <td className="px-4 py-3 text-slate-600">{company.phone || '-'}</td>
              <td className="px-4 py-3 text-slate-600">{company.email || '-'}</td>
              <td className="px-4 py-3 text-slate-600"><span className="rounded bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">{company.contacts_count ?? 0} contato(s)</span></td>
              <td className="px-4 py-3">
                <button className="text-red-500 hover:text-red-700 p-1" onClick={() => handleDeleteCompany(company.id)} title="Excluir">
                  <Trash2 size={16} />
                </button>
              </td>
            </tr>
          ))}
        </DataTable>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Cadastrar Nova Empresa</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateCompany} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Nome da Empresa *</label>
                <input required className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Ex: Ávila Ops Tecnologia" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">CNPJ</label>
                  <input className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.cnpj} onChange={(e) => setForm({ ...form, cnpj: e.target.value })} placeholder="00.000.000/0001-00" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Domínio / Website</label>
                  <input className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.domain} onChange={(e) => setForm({ ...form, domain: e.target.value })} placeholder="avila.inc" />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Telefone</label>
                  <input className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="+55 11 99999-9999" />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">E-mail</label>
                  <input type="email" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} placeholder="contato@empresa.com" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Endereço / Cidade</label>
                <input className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} placeholder="São Paulo, SP" />
              </div>
              <div className="mt-5 flex justify-end gap-2 pt-2">
                <button type="button" className="rounded border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setShowModal(false)}>Cancelar</button>
                <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                  {saving ? 'Salvando...' : 'Cadastrar Empresa'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function TasksPage() {
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [tabFilter, setTabFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [saving, setSaving] = useState(false)

  const [form, setForm] = useState({
    title: '',
    description: '',
    dueAt: '',
    priority: 'medium' as 'low' | 'medium' | 'high',
  })

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true)
      listTasks({ status: tabFilter, search })
        .then((data) => {
          setTasks(data.tasks)
          setTotal(data.pagination.total)
          setError('')
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [tabFilter, search])

  const handleToggleTask = async (task: CrmTask) => {
    const newStatus = task.status === 'open' ? 'completed' : 'open'
    try {
      await updateTask(task.id, { status: newStatus })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t)))
    } catch (err: any) {
      alert(err.message || 'Falha ao atualizar tarefa.')
    }
  }

  const handleDeleteTask = async (taskId: string) => {
    if (!confirm('Deseja realmente remover esta tarefa?')) return
    try {
      await deleteTask(taskId)
      setTasks((prev) => prev.filter((t) => t.id !== taskId))
      setTotal((prev) => Math.max(0, prev - 1))
    } catch (err: any) {
      alert(err.message || 'Falha ao remover tarefa.')
    }
  }

  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.title.trim()) return
    setSaving(true)
    try {
      const created = await createTask({
        title: form.title,
        description: form.description || undefined,
        dueAt: form.dueAt || undefined,
        priority: form.priority,
      })
      setTasks((prev) => [created.task, ...prev])
      setTotal((prev) => prev + 1)
      setShowModal(false)
      setForm({ title: '', description: '', dueAt: '', priority: 'medium' })
    } catch (err: any) {
      alert(err.message || 'Falha ao criar tarefa.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <Topbar title="Tarefas & Lembretes" tab={`${total} tarefa(s)`} action="+ Nova Tarefa" onAction={() => setShowModal(true)} />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded border border-slate-200 shadow-sm">
          <div className="flex gap-2">
            {(['open', 'completed', 'all'] as const).map((filter) => (
              <button
                key={filter}
                className={`rounded px-4 py-2 text-xs font-semibold transition ${
                  tabFilter === filter ? 'bg-slate-900 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
                onClick={() => setTabFilter(filter)}
              >
                {filter === 'open' ? 'Pendentes' : filter === 'completed' ? 'Concluídas' : 'Todas'}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 flex-1 max-w-xs bg-slate-50 px-3 py-1.5 rounded border border-slate-200">
            <Search size={16} className="text-slate-400" />
            <input
              type="text"
              placeholder="Filtrar tarefas..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs outline-none placeholder:text-slate-400"
            />
          </div>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

        <div className="overflow-hidden bg-white rounded border border-slate-200 shadow-sm">
          {loading && <div className="p-8 text-center text-sm text-slate-500">Carregando tarefas...</div>}
          {!loading && tasks.length === 0 && <div className="p-8 text-center text-sm text-slate-500">Nenhuma tarefa encontrada.</div>}
          {!loading &&
            tasks.map((task) => {
              const isCompleted = task.status === 'completed'
              const priorityColor = task.priority === 'high' ? 'bg-red-100 text-red-700' : task.priority === 'low' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700'
              const priorityLabel = task.priority === 'high' ? 'Alta' : task.priority === 'low' ? 'Baixa' : 'Média'
              return (
                <div key={task.id} className={`flex items-center justify-between border-b border-slate-100 p-4 transition ${isCompleted ? 'bg-slate-50/70' : 'hover:bg-slate-50'}`}>
                  <div className="flex items-center gap-3 min-w-0">
                    <button className="text-slate-400 hover:text-blue-600 shrink-0" onClick={() => handleToggleTask(task)}>
                      {isCompleted ? <CheckCircle2 className="text-emerald-600" size={20} /> : <div className="h-5 w-5 rounded-full border-2 border-slate-300" />}
                    </button>
                    <div className="min-w-0">
                      <p className={`text-sm font-semibold ${isCompleted ? 'text-slate-400 line-through' : 'text-slate-900'}`}>{task.title}</p>
                      {task.description && <p className="text-xs text-slate-500 truncate mt-0.5">{task.description}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-400">
                        {task.due_at && (
                          <span className="flex items-center gap-1 text-slate-600 font-medium">
                            <Clock size={12} /> {new Date(task.due_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                        {task.contact_name && <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">Contato: {task.contact_name}</span>}
                        {task.lead_title && <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[11px] text-blue-700">Lead: {task.lead_title}</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded px-2 py-0.5 text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
                    <a
                      href={createGoogleCalendarUrl({ title: task.title, description: task.description ?? undefined, dueAt: task.due_at ?? undefined })}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="rounded border border-emerald-200 bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-100"
                      title="Adicionar ao Google Agenda"
                    >
                      + Google Agenda
                    </a>
                    <button className="text-slate-400 hover:text-red-600 p-1" onClick={() => handleDeleteTask(task.id)}>
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              )
            })}
        </div>
      </div>

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">Nova Tarefa / Lembrete</h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setShowModal(false)}><X size={18} /></button>
            </div>
            <form onSubmit={handleCreateTask} className="mt-4 space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700">Título da Tarefa *</label>
                <input required className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Ex: Enviar proposta de contrato" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700">Descrição / Notas</label>
                <textarea rows={3} className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Detalhes adicionais sobre esta tarefa..." />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Data de Vencimento</label>
                  <input type="datetime-local" className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.dueAt} onChange={(e) => setForm({ ...form, dueAt: e.target.value })} />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700">Prioridade</label>
                  <select className="mt-1 w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-500" value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })}>
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </div>
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3 mt-4">
                <button
                  type="button"
                  disabled={!form.title.trim()}
                  className="flex items-center gap-1 rounded border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                  onClick={() => {
                    const url = createGoogleCalendarUrl({ title: form.title, description: form.description, dueAt: form.dueAt })
                    window.open(url, '_blank')
                  }}
                >
                  <CalendarDays size={14} /> + Google Agenda
                </button>
                <div className="flex gap-2">
                  <button type="button" className="rounded border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50" onClick={() => setShowModal(false)}>Cancelar</button>
                  <button type="submit" disabled={saving} className="rounded bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
                    {saving ? 'Salvando...' : 'Criar Tarefa'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function ContactsList() {
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const loadContacts = () => {
    setLoading(true)
    listContacts({ search, page: 1, pageSize: 50 })
      .then((data) => {
        setContacts(data.contacts)
        setTotal(data.pagination.total)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadContacts()
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  return (
    <DataPage title="Contatos" tab={`${total} contato(s)`} search={search} setSearch={setSearch} error={error}>
      <DataTable columns={['Nome', 'Empresa', 'Telefone', 'E-mail', 'Origem', 'Atualizado']}>
        {loading && <TableMessage colSpan={6} text="Carregando contatos..." />}
        {!loading && contacts.length === 0 && <TableMessage colSpan={6} text="Nenhum contato encontrado." />}
        {contacts.map((contact) => (
          <tr
            key={contact.id}
            onClick={() => setSelectedContactId(contact.id)}
            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/50 transition"
          >
            <td className="px-4 py-3 font-bold text-slate-900">{contact.name}</td>
            <td className="px-4 py-3 text-slate-600">{contact.company ?? '-'}</td>
            <td className="px-4 py-3 font-mono text-slate-600">{contact.phone ?? '-'}</td>
            <td className="px-4 py-3 text-slate-600">{contact.email ?? '-'}</td>
            <td className="px-4 py-3">
              <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold uppercase text-slate-700">
                {contact.source ?? 'manual'}
              </span>
            </td>
            <td className="px-4 py-3 text-slate-400 text-xs">{new Date(contact.updated_at).toLocaleString('pt-BR')}</td>
          </tr>
        ))}
      </DataTable>

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
    </DataPage>
  )
}

function LeadsList() {
  const [leads, setLeads] = useState<CrmLead[]>([])
  const [stages, setStages] = useState<PipelineStage[]>([])
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null)

  const loadData = () => {
    setLoading(true)
    Promise.all([
      listLeads({ search, page: 1, pageSize: 50 }),
      getPipeline(),
    ])
      .then(([leadsData, pipelineData]) => {
        setLeads(leadsData.leads)
        setTotal(leadsData.pagination.total)
        setStages(pipelineData.stages)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      loadData()
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [search])

  return (
    <DataPage title="Leads & Negócios" tab={`${total} lead(s)`} search={search} setSearch={setSearch} error={error}>
      <DataTable columns={['Oportunidade', 'Contato', 'Empresa', 'Etapa', 'Valor', 'Status']}>
        {loading && <TableMessage colSpan={6} text="Carregando leads..." />}
        {!loading && leads.length === 0 && <TableMessage colSpan={6} text="Nenhum lead encontrado." />}
        {leads.map((lead) => (
          <tr
            key={lead.id}
            onClick={() => setSelectedLead(lead)}
            className="cursor-pointer border-b border-slate-100 hover:bg-blue-50/50 transition"
          >
            <td className="px-4 py-3 font-bold text-slate-900">{lead.title}</td>
            <td className="px-4 py-3 text-slate-700">{lead.contact_name ?? '-'}</td>
            <td className="px-4 py-3 text-slate-500">{lead.contact_company ?? '-'}</td>
            <td className="px-4 py-3">
              <span className="rounded-md bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                {lead.stage_name ?? '-'}
              </span>
            </td>
            <td className="px-4 py-3 font-extrabold text-slate-900">{formatCurrency(lead.value_cents)}</td>
            <td className="px-4 py-3">
              <span
                className={`rounded px-2 py-0.5 text-[11px] font-bold uppercase tracking-wider ${
                  lead.status === 'won'
                    ? 'bg-emerald-100 text-emerald-800'
                    : lead.status === 'lost'
                    ? 'bg-rose-100 text-rose-800'
                    : 'bg-blue-100 text-blue-800'
                }`}
              >
                {lead.status === 'won' ? 'Ganho' : lead.status === 'lost' ? 'Perdido' : 'Aberto'}
              </span>
            </td>
          </tr>
        ))}
      </DataTable>

      {selectedLead && (
        <LeadDetailDrawer
          lead={selectedLead}
          stages={stages}
          onClose={() => setSelectedLead(null)}
          onUpdated={(updated) => {
            setLeads((prev) => prev.map((l) => (l.id === updated.id ? updated : l)))
            setSelectedLead(updated)
          }}
          onDeleted={(deletedId) => {
            setLeads((prev) => prev.filter((l) => l.id !== deletedId))
            setSelectedLead(null)
          }}
        />
      )}
    </DataPage>
  )
}

function DataPage({ title, tab, search, setSearch, error, children }: { title: string; tab: string; search: string; setSearch: (value: string) => void; error: string; children: React.ReactNode }) {
  return (
    <div>
      <Topbar title={title} tab={tab} />
      <div className="space-y-4 p-5">
        <input className="w-full max-w-md rounded border border-slate-200 bg-white px-3 py-2 text-sm outline-none" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar..." />
        {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {children}
      </div>
    </div>
  )
}

function DataTable({ columns, children }: { columns: string[]; children: React.ReactNode }) {
  return (
    <div className="overflow-auto bg-white">
      <table className="min-w-[860px] w-full border-collapse text-sm">
        <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
          <tr>{columns.map((column) => <th key={column} className="border-b border-slate-200 px-4 py-3">{column}</th>)}</tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

function AuditLogsList() {
  const [logs, setLogs] = useState<AuditLogEntry[]>([])
  const [search, setSearch] = useState('')
  const [entityType, setEntityType] = useState('all')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [expandedId, setExpandedId] = useState<string | null>(null)

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setLoading(true)
      listAuditLogs({ entityType, search, page: 1, pageSize: 50 })
        .then((data) => {
          setLogs(data.logs)
          setTotal(data.pagination.total)
          setError('')
        })
        .catch((err: Error) => setError(err.message))
        .finally(() => setLoading(false))
    }, 250)
    return () => window.clearTimeout(timeout)
  }, [entityType, search])

  const getEventBadge = (type: string) => {
    if (type.includes('created') || type.includes('login')) return 'bg-emerald-100 text-emerald-800 border-emerald-200'
    if (type.includes('failed') || type.includes('deleted')) return 'bg-rose-100 text-rose-800 border-rose-200'
    if (type.includes('updated') || type.includes('sent')) return 'bg-blue-100 text-blue-800 border-blue-200'
    return 'bg-slate-100 text-slate-700 border-slate-200'
  }

  return (
    <div>
      <Topbar title="Auditoria & Logs de Segurança" tab={`${total} evento(s) auditado(s)`} />
      <div className="p-6 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded border border-slate-200 shadow-sm">
          <div className="flex items-center gap-2 flex-1 min-w-[240px]">
            <Search size={18} className="text-slate-400" />
            <input
              type="text"
              placeholder="Buscar por usuário, e-mail, evento ou ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-sm outline-none placeholder:text-slate-400"
            />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500">Filtrar Categoria:</span>
            <select
              value={entityType}
              onChange={(e) => setEntityType(e.target.value)}
              className="rounded border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 outline-none"
            >
              <option value="all">Todas as Categorias</option>
              <option value="message">Mensagens & WhatsApp</option>
              <option value="lead">Leads & Funil</option>
              <option value="contact">Contatos</option>
              <option value="task">Tarefas</option>
              <option value="company">Empresas</option>
              <option value="integration">Integrações & Meta</option>
              <option value="auth">Autenticação & Acesso</option>
            </select>
          </div>
        </div>

        {error && <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-600">{error}</div>}

        <div className="overflow-hidden bg-white rounded border border-slate-200 shadow-sm">
          <DataTable columns={['Data e Hora', 'Usuário / Responsável', 'Evento Auditado', 'Categoria', 'Request ID', 'Ações']}>
            {loading && <TableMessage colSpan={6} text="Carregando logs de auditoria..." />}
            {!loading && logs.length === 0 && <TableMessage colSpan={6} text="Nenhum evento de auditoria encontrado." />}
            {logs.map((log) => (
              <>
                <tr key={log.id} className="border-b border-slate-100 hover:bg-slate-50/50">
                  <td className="px-4 py-3 font-mono text-xs text-slate-600">
                    {new Date(log.created_at).toLocaleString('pt-BR')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="font-medium text-slate-900">{log.user_name ?? 'Sistema / Webhook'}</div>
                    {log.user_email && <div className="text-xs text-slate-400">{log.user_email}</div>}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${getEventBadge(log.event_type)}`}>
                      {log.event_type}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs uppercase font-bold text-slate-500">{log.entity_type}</td>
                  <td className="px-4 py-3 font-mono text-xs text-slate-400">{log.request_id ? log.request_id.slice(0, 13) : '-'}</td>
                  <td className="px-4 py-3">
                    <button
                      className="rounded border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100"
                      onClick={() => setExpandedId(expandedId === log.id ? null : log.id)}
                    >
                      {expandedId === log.id ? 'Ocultar JSON' : 'Ver Detalhes'}
                    </button>
                  </td>
                </tr>
                {expandedId === log.id && (
                  <tr key={`${log.id}-details`} className="bg-slate-900 text-slate-200">
                    <td colSpan={6} className="p-4">
                      <div className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-400">Trilha de Detalhes do Evento (Payload JSON):</div>
                      <pre className="overflow-x-auto rounded bg-slate-950 p-3 font-mono text-xs text-emerald-400">
                        {JSON.stringify(log.payload, null, 2)}
                      </pre>
                    </td>
                  </tr>
                )}
              </>
            ))}
          </DataTable>
        </div>
      </div>
    </div>
  )
}

export default Workspace

export { Topbar }

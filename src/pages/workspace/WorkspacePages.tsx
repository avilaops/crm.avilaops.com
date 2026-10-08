import CompanyDetails from '../../components/CompanyDetails'
import ContactCreate from '../../components/ContactCreate'
import InboxPresence from '../../components/InboxPresence'
import PipelineSettings from '../../components/PipelineSettings'
import { TaskEditor, ReminderList } from '../../components/CrmRecordTools'
import { useEffect, useRef, useState } from 'react'
import Topbar from '../../components/layout/Topbar'
import { Notice } from '../../components/ui/Form'
import { EmptyState } from '../../components/ui/Rows'
import { hasOfficialWhatsApp } from '../../lib/activation'
import { formatPhoneBR } from '../../lib/format'
import { useNavigation } from '../../lib/navigationContext'
import { initials, useSession } from '../../lib/session'
import { buttonClass } from '../../lib/ui'
import { EXPANDED_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import HomePage from './HomePage'
import AiAgentPage from './AiAgentPage'
import MailInbox from './MailInbox'
import NewsletterPage from './newsletter/NewsletterPage'
import ProductsPage from './ProductsPage'
import AutomationsPage from './AutomationsPage'
import SegmentsPage from './SegmentsPage'
import MediaPage from './MediaPage'
import TeamChatPage from './TeamChatPage'
import AllContactsPage from './AllContactsPage'
import { ImportContactsSheet } from '../../components/contacts/ImportContactsSheet'
import CreateLeadModal from '../../components/modals/CreateLeadModal'
import ContactDetailDrawer from '../../components/drawers/ContactDetailDrawer'
import LeadDetailDrawer from '../../components/drawers/LeadDetailDrawer'
import { Archive, CheckCircle2, ChevronLeft, ChevronRight, Clock, FileText, FileUp, MessageCircle, Paperclip, Plus, RefreshCw, Search, Send, SlidersHorizontal, Trash2, UserRound, X } from 'lucide-react'
import { createGoogleCalendarUrl } from '../../lib/googleCalendar'
import {
  ApiError,
  archiveConversation,
  assignConversation,
  bootstrap,
  createCompany,
  createLeadFromConversation,
  deleteCompany,
  deleteTask,
  getPipeline,
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

function Workspace() {
  const { route, navigate } = useNavigation()
  switch (route.page) {
    case 'chat-inbox':
      return (
        <ChatInbox
          conversationId={route.param ?? null}
          openConversation={(id) => navigate({ page: 'chat-inbox', param: id })}
          closeConversation={() => navigate({ page: 'chat-inbox' })}
          connectChannel={() => navigate('whatsapp-channel')}
        />
      )
    case 'mail-inbox':
      return <MailInbox />
    case 'newsletter':
      return <NewsletterPage />
    case 'team-chat':
      return <TeamChatPage />
    case 'pipeline':
      return <Pipeline />
    case 'leads':
      return <LeadsList />
    case 'calendar':
      return <TasksPage />
    case 'contacts':
      return <ContactsList />
    case 'companies':
      return <CompaniesList />
    case 'all-contacts':
      return <AllContactsPage />
    case 'media':
      return <MediaPage />
    case 'products':
      return <ProductsPage />
    case 'segments':
      return <SegmentsPage />
    case 'ai-agent':
      return <AiAgentPage />
    case 'automations':
      return <AutomationsPage />
    default:
      return <HomePage />
  }
}

/**
 * Caixa de entrada.
 *
 * No celular é uma pilha: lista de conversas, depois a conversa, com Voltar —
 * cada nível com o próprio endereço (`/communications/inbox/<id>/`), então o
 * botão Voltar do navegador e o link colado funcionam. A partir de 840px a
 * lista e a conversa ficam lado a lado, como antes.
 */
function ChatInbox({
  conversationId,
  openConversation,
  closeConversation,
  connectChannel,
}: {
  conversationId: string | null
  openConversation: (id: string) => void
  closeConversation: () => void
  connectChannel: () => void
}) {
  const { user } = useSession()
  const wide = useMediaQuery(EXPANDED_QUERY)
  const [conversations, setConversations] = useState<CrmConversation[]>([])
  // No computador a primeira conversa abre sozinha ao lado da lista. No
  // celular não: ela ficaria escondida atrás da lista, e o que chegasse nela
  // seria marcado como lido sem ninguém ter visto.
  const [autoId, setAutoId] = useState<string | null>(null)
  const selectedId = conversationId ?? (wide ? autoId : null)
  const [messages, setMessages] = useState<CrmMessage[]>([])
  const [channels, setChannels] = useState<CrmChannel[]>([])
  const [users, setUsers] = useState<CrmUser[]>([])
  const [filters, setFilters] = useState<ConversationFilters>({ page: 1, pageSize: 30 })
  const [moreFilters, setMoreFilters] = useState(false)
  const [total, setTotal] = useState(0)
  const [unreadTotal, setUnreadTotal] = useState(0)
  const [reply, setReply] = useState('')
  const [sending, setSending] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [creatingLead, setCreatingLead] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
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
  // Abriu a conversa tocando na lista: o Voltar desfaz esse passo do
  // histórico. Quem chegou por link volta para a lista sem sair do CRM.
  const openedFromList = useRef(false)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)

  const refresh = (nextFilters = filters) => {
    setLoading(true)
    listConversations(nextFilters)
      .then((data) => {
        setConversations(data.conversations)
        setTotal(data.pagination.total)
        setUnreadTotal(data.unread?.messages ?? 0)
        setAutoId((current) => current && data.conversations.some((item) => item.id === current) ? current : data.conversations[0]?.id ?? null)
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
        setAutoId(data.conversations[0]?.id ?? null)
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

  // Abrir a conversa (tocando na lista ou por link) zera o não lido dela. A
  // primeira conversa que abre sozinha no computador não conta: ninguém a
  // escolheu, e o contador continua avisando que há o que ler.
  useEffect(() => {
    if (!conversationId) return
    const conversation = conversations.find((item) => item.id === conversationId)
    if (!conversation || conversation.unread_count === 0) return
    setUnreadTotal((value) => Math.max(0, value - conversation.unread_count))
    patchConversation(conversationId, { unread_count: 0 })
    markConversationRead(conversationId).catch(() => {})
  }, [conversationId, conversations])

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
    openedFromList.current = true
    setNotice('')
    setError('')
    openConversation(conversationId)
  }

  function handleBack() {
    if (openedFromList.current) {
      openedFromList.current = false
      window.history.back()
      return
    }
    closeConversation()
  }

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const waitingCount = conversations.filter((conversation) => conversation.status === 'waiting').length
  const selectedAssignee = selected?.assigned_user_id ?? ''
  const windowState = describeWindow(selected, now)
  const hasOfficialChannel = hasOfficialWhatsApp(channels)
  const viewAll = !filters.assignedUserId && !filters.unassigned

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
      setNotice(`${result.total} template(s) sincronizado(s).`)
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
    setNotice('')
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
    setNotice('')
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
    setNotice('')
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
    setNotice('')
    try {
      await createLeadFromConversation(selected.id)
      setNotice('Lead criado e vinculado ao contato da conversa.')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreatingLead(false)
    }
  }

  const chipClass = (active: boolean) =>
    `inline-flex min-h-11 shrink-0 items-center rounded-full border px-3.5 text-sm font-medium transition ${
      active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300'
    }`
  const actionClass = 'inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-700 disabled:opacity-60'
  const officialWindow = selected ? PROVIDERS_WITH_WINDOW.includes(selected.channel_provider ?? '') : false
  const feedback = (
    <>
      {error && <div className="px-3 pt-3 expanded:px-5"><Notice tone="danger">{error}</Notice></div>}
      {notice && <div className="px-3 pt-3 expanded:px-5"><Notice tone="success">{notice}</Notice></div>}
    </>
  )

  return (
    <div className="flex h-[calc(100dvh-var(--app-bottom-nav))] flex-col">
      <div className={conversationId ? 'hidden expanded:block' : ''}>
        <Topbar title="Caixa de entrada" tab={`${total} conversa(s)${unreadTotal > 0 ? ` · ${unreadTotal} não lida(s)` : ''}`} />
      </div>
      <div className="grid min-h-0 flex-1 grid-cols-1 expanded:grid-cols-[320px_minmax(0,1fr)]">
        <aside className={`${conversationId ? 'hidden' : 'flex'} min-h-0 min-w-0 flex-col border-r border-slate-200 bg-white expanded:flex`} aria-label="Conversas">
          <div className="space-y-3 border-b border-slate-200 p-3">
            <div className="flex items-center justify-between gap-3 text-xs">
              <InboxPresence />
              <span className={`inline-flex items-center gap-1.5 ${connected ? 'text-emerald-700' : 'text-slate-500'}`} title={connected ? 'Recebendo mensagens em tempo real' : 'Reconectando ao fluxo em tempo real'}>
                <span className={`size-2 rounded-full ${connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                {connected ? 'Ao vivo' : 'Reconectando'}
              </span>
              {waitingCount > 0 && <span className="font-semibold text-amber-700">{waitingCount} aguardando resposta</span>}
            </div>
            <input
              type="search"
              className="input"
              placeholder="Buscar conversa"
              aria-label="Buscar conversas"
              value={filters.search ?? ''}
              onChange={(event) => setFilters((current) => ({ ...current, search: event.target.value, page: 1 }))}
            />
            <div className="scroll-chips -mx-3 flex gap-2 px-3" role="group" aria-label="Filtros rápidos">
              <button type="button" className={chipClass(viewAll)} aria-pressed={viewAll} onClick={() => setFilters((current) => ({ ...current, assignedUserId: undefined, unassigned: undefined, page: 1 }))}>
                Todas
              </button>
              <button type="button" className={chipClass(filters.assignedUserId === user.id)} aria-pressed={filters.assignedUserId === user.id} onClick={() => setFilters((current) => ({ ...current, assignedUserId: user.id, unassigned: undefined, page: 1 }))}>
                Minhas
              </button>
              <button type="button" className={chipClass(Boolean(filters.unassigned))} aria-pressed={Boolean(filters.unassigned)} onClick={() => setFilters((current) => ({ ...current, unassigned: true, assignedUserId: undefined, page: 1 }))}>
                Sem responsável
              </button>
              <button type="button" className={chipClass(filters.status === 'waiting')} aria-pressed={filters.status === 'waiting'} onClick={() => setFilters((current) => ({ ...current, status: current.status === 'waiting' ? undefined : 'waiting', page: 1 }))}>
                Aguardando
              </button>
              <button type="button" className={chipClass(Boolean(filters.slaOverdue))} aria-pressed={Boolean(filters.slaOverdue)} onClick={() => setFilters((current) => ({ ...current, slaOverdue: !current.slaOverdue, page: 1 }))}>
                SLA vencido
              </button>
              <button type="button" className={chipClass(moreFilters)} aria-expanded={moreFilters} onClick={() => setMoreFilters((value) => !value)}>
                <SlidersHorizontal size={15} className="mr-1.5" aria-hidden="true" />
                Mais filtros
              </button>
            </div>
            {moreFilters && (
              <div className="grid gap-2">
                <select className="input" aria-label="Status" value={filters.status ?? ''} onChange={(event) => setFilters((current) => ({ ...current, status: event.target.value || undefined, page: 1 }))}>
                  <option value="">Todos os status</option>
                  <option value="waiting">Aguardando</option>
                  <option value="open">Aberto</option>
                  <option value="archived">Arquivado</option>
                </select>
                <select className="input" aria-label="Canal" value={filters.channelId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, channelId: event.target.value || undefined, page: 1 }))}>
                  <option value="">Todos os canais</option>
                  {channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.phone_number ? formatPhoneBR(channel.phone_number) : channel.display_name}</option>)}
                </select>
                <select className="input" aria-label="Atendente" value={filters.assignedUserId ?? ''} onChange={(event) => setFilters((current) => ({ ...current, assignedUserId: event.target.value || undefined, unassigned: undefined, page: 1 }))}>
                  <option value="">Todos os atendentes</option>
                  {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                <button type="button" className={actionClass} onClick={() => setFilters({ page: 1, pageSize: 30 })}>
                  Limpar filtros
                </button>
              </div>
            )}
          </div>

          {!loading && !hasOfficialChannel && (
            <button type="button" className="flex min-h-16 w-full items-center gap-3 border-b border-slate-100 px-4 py-3 text-left hover:bg-slate-50" onClick={connectChannel}>
              <span className="grid size-10 shrink-0 place-items-center rounded-full border border-dashed border-slate-400 text-slate-600">
                <Plus size={18} aria-hidden="true" />
              </span>
              <span className="min-w-0">
                <span className="block font-semibold text-slate-900">Conectar o WhatsApp</span>
                <span className="block text-sm text-slate-500">Receba as mensagens dos clientes aqui.</span>
              </span>
            </button>
          )}
          {!selected && feedback}

          <div className="min-h-0 flex-1 overflow-y-auto">
            {loading && conversations.length === 0 && <p className="p-8 text-center text-sm text-slate-500">Carregando conversas…</p>}
            {!loading && conversations.length === 0 && (
              <EmptyState
                icon={MessageCircle}
                title={hasOfficialChannel ? 'Nenhuma conversa por aqui' : 'Nenhuma conversa ainda'}
                description={hasOfficialChannel ? 'Quando um cliente escrever, a conversa aparece aqui na hora.' : 'Conecte o WhatsApp para começar a receber mensagens dos seus clientes.'}
                action={!hasOfficialChannel ? <button type="button" className={buttonClass.primary} onClick={connectChannel}>Conectar o WhatsApp</button> : undefined}
              />
            )}
            <ul className="divide-y divide-slate-100">
              {conversations.map((conversation) => (
                <li key={conversation.id}>
                  <button
                    type="button"
                    className={`flex w-full items-start gap-3 px-4 py-3 text-left transition ${conversation.id === selectedId ? 'bg-blue-50' : 'hover:bg-slate-50'}`}
                    aria-current={conversation.id === selectedId ? 'true' : undefined}
                    onClick={() => handleSelect(conversation.id)}
                  >
                    <div className="relative shrink-0">
                      <div className="grid size-11 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700">
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
                        <p className={`truncate ${conversation.unread_count > 0 ? 'font-bold' : 'font-semibold'} text-slate-900`}>{contactLabel(conversation)}</p>
                        <StatusPill status={conversation.status} />
                      </div>
                      <p className="truncate text-sm text-slate-500">
                        {conversation.contact_name && conversation.contact_phone ? formatPhoneBR(conversation.contact_phone) : conversation.channel_name ?? 'WhatsApp'}
                      </p>
                      <p className="mt-0.5 truncate text-xs text-slate-500">
                        {conversation.unassigned ? 'Sem responsável' : conversation.assigned_user_name ?? 'Responsável definido'}
                        {conversation.waiting_seconds > 0 ? ` · aguardando ${formatWait(conversation.waiting_seconds)}` : ''}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        </aside>

        <section className={`${conversationId ? 'flex' : 'hidden'} min-h-0 min-w-0 flex-col bg-slate-50 expanded:flex`} aria-label="Conversa">
          {!selected ? (
            <div className="flex min-h-0 flex-1 flex-col">
              {/* Conversa aberta por link que não está na lista carregada: sem
                  isto o celular ficaria sem Voltar, porque a barra inferior
                  some dentro de uma conversa. */}
              {conversationId && (
                <div className="flex min-h-14 items-center border-b border-slate-200 bg-white px-1 pt-[env(safe-area-inset-top)] expanded:hidden">
                  <button type="button" className="grid size-11 place-items-center rounded-full text-slate-600 hover:bg-slate-100" aria-label="Voltar para as conversas" onClick={handleBack}>
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                  <span className="px-1 font-semibold text-slate-900">Conversa</span>
                </div>
              )}
              <div className="grid flex-1 place-items-center p-6">
                <EmptyState
                  icon={MessageCircle}
                  title={loading ? 'Carregando…' : conversationId ? 'Conversa não encontrada nesta lista' : 'Escolha uma conversa'}
                  description={
                    conversationId && !loading
                      ? 'Ela pode estar arquivada ou fora dos filtros. Volte e busque pelo nome ou telefone.'
                      : hasOfficialChannel || loading
                        ? 'A conversa aberta aparece aqui, com a janela de 24 horas e o histórico do cliente.'
                        : 'Conecte o WhatsApp para receber e responder todas as mensagens num lugar só.'
                  }
                  action={!hasOfficialChannel && !loading ? <button type="button" className={buttonClass.primary} onClick={connectChannel}>Conectar o WhatsApp</button> : undefined}
                />
              </div>
            </div>
          ) : (
            <div className="flex min-h-0 flex-1 flex-col">
              <div className="border-b border-slate-200 bg-white pt-[env(safe-area-inset-top)] expanded:pt-0">
                <div className="flex min-h-14 items-center gap-1 px-1 expanded:min-h-16 expanded:px-5">
                  <button type="button" className="grid size-11 shrink-0 place-items-center rounded-full text-slate-600 hover:bg-slate-100 expanded:hidden" aria-label="Voltar para as conversas" onClick={handleBack}>
                    <ChevronLeft size={22} aria-hidden="true" />
                  </button>
                  <div className="min-w-0 flex-1 px-1">
                    <h2 className="truncate font-semibold text-slate-900">{contactLabel(selected)}</h2>
                    <p className="truncate text-xs text-slate-500">
                      {selected.channel_phone ? `Pelo ${formatPhoneBR(selected.channel_phone)}` : selected.channel_name ?? 'WhatsApp'}
                    </p>
                  </div>
                  {selected.contact_id && (
                    <button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3 text-sm font-semibold text-blue-700 hover:bg-blue-50" onClick={() => setSelectedContactId(selected.contact_id)}>
                      <UserRound size={16} aria-hidden="true" />
                      Ficha
                    </button>
                  )}
                </div>
                <div className="scroll-chips flex items-center gap-2 px-3 pb-2 expanded:px-5">
                  {windowState.label && (
                    <span className={`inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold ${windowState.tone}`} title={windowState.hint}>
                      <Clock size={13} aria-hidden="true" />
                      {windowState.label}
                    </span>
                  )}
                  <select className="input w-auto! shrink-0" aria-label="Responsável" value={selectedAssignee} onChange={(event) => handleAssign(event.target.value)}>
                    <option value="">Sem responsável</option>
                    {users.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                  </select>
                  <button
                    type="button"
                    className={actionClass}
                    onClick={() => archiveConversation(selected.id).then(() => patchConversation(selected.id, { status: 'archived' }))}
                  >
                    <Archive size={15} aria-hidden="true" />
                    Arquivar
                  </button>
                  <button type="button" className={actionClass} disabled={creatingLead} onClick={handleCreateLead}>
                    <Plus size={15} aria-hidden="true" />
                    {creatingLead ? 'Criando…' : 'Criar lead'}
                  </button>
                </div>
              </div>
              {feedback}
              <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-3 expanded:p-5">
                {messages.length === 0 && <p className="mt-12 text-center text-sm text-slate-500">Nenhuma mensagem gravada para esta conversa.</p>}
                {messages.map((message) => (
                  <MessageBubble key={message.id} message={message} />
                ))}
                <div ref={messagesEnd} />
              </div>
              <div className="border-t border-slate-200 bg-white p-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] expanded:p-4">
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
                    <textarea
                      className="input min-h-20 resize-none"
                      aria-label="Resposta"
                      value={reply}
                      onChange={(event) => setReply(event.target.value)}
                      placeholder="Responder pelo WhatsApp…"
                    />
                    <div className="mt-2 flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInput}
                          type="file"
                          className="hidden"
                          onChange={(event) => handleAttach(event.target.files?.[0])}
                        />
                        <button
                          type="button"
                          className={actionClass}
                          disabled={uploading || selected.channel_provider !== 'whatsapp'}
                          title={selected.channel_provider !== 'whatsapp' ? 'Anexos ainda não passam pela Messageria' : 'Anexar arquivo'}
                          onClick={() => fileInput.current?.click()}
                        >
                          <Paperclip size={15} aria-hidden="true" />
                          <span className="max-medium:sr-only">{uploading ? 'Enviando anexo…' : 'Anexar'}</span>
                        </button>
                        {officialWindow && (
                          <button type="button" className={actionClass} onClick={loadTemplates}>
                            <FileText size={15} aria-hidden="true" />
                            <span className="max-medium:sr-only">Modelo</span>
                          </button>
                        )}
                      </div>
                      <button type="button" className={buttonClass.primary} disabled={sending || !reply.trim()} onClick={handleSend}>
                        <Send size={16} aria-hidden="true" />
                        {sending ? 'Enviando…' : 'Enviar'}
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

/** Canais em que vale a janela de 24h da Meta — o mesmo que o backend aplica. */
const PROVIDERS_WITH_WINDOW = ['whatsapp', 'messageria']

function contactLabel(conversation: CrmConversation) {
  return conversation.contact_name || formatPhoneBR(conversation.contact_phone) || 'Contato sem nome'
}

/**
 * Traduz a janela de 24h para o que a tela precisa decidir.
 *
 * O backend ja recusa o texto livre fora da janela; aqui a conta serve para
 * avisar antes de o atendente escrever, nao para autorizar o envio.
 */
function describeWindow(conversation: CrmConversation | null, now: number) {
  // A janela é regra da Meta, não do caminho: vale para a Cloud API falada
  // daqui e para o mesmo número falado pela Messageria.
  if (!conversation || !PROVIDERS_WITH_WINDOW.includes(conversation.channel_provider ?? '')) {
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
    hint: 'Tempo restante para responder com texto livre.',
  }
}

/** O status gravado é o da plataforma (sent, delivered...); a bolha fala português. */
const messageStatusLabels: Record<string, string> = {
  sent: 'enviada',
  delivered: 'entregue',
  read: 'lida',
  failed: 'falhou',
  pending: 'enviando',
  queued: 'na fila',
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
          {new Date(message.sent_at).toLocaleString('pt-BR')} · {message.message_type === 'template' ? 'modelo · ' : ''}{messageStatusLabels[message.status] ?? message.status}
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
  const [allStages, setStages] = useState<PipelineStage[]>([])
  const [allLeads, setLeads] = useState<CrmLead[]>([])
  const [contacts, setContacts] = useState<CrmContact[]>([])
  const [companies, setCompanies] = useState<CrmCompany[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [selectedLead, setSelectedLead] = useState<CrmLead | null>(null)
  const [selectedContactId, setSelectedContactId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [createDefaultStageId, setCreateDefaultStageId] = useState<string | undefined>(undefined)
  // Etapa aberta no celular, onde o funil mostra uma por vez.
  const [activeStageId, setActiveStageId] = useState<string | null>(null)

  const [pipelineId,setPipelineId] = useState('')
  const stages = allStages.filter(s => !pipelineId || s.pipeline_id === pipelineId)
  const leads = allLeads.filter(l => !pipelineId || stages.some(s => s.id === l.stage_id))
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
  const currentStage = stages.find((stage) => stage.id === activeStageId) ?? stages[0] ?? null
  const currentStageLeads = currentStage ? leads.filter((l) => l.stage_id === currentStage.id) : []

  return (
    <div>
      <Topbar
        title="Funil de vendas"
        tab={`${formatCurrency(totalValueCents)} · ${leads.length} oportunidade(s)`}
        action="+ Novo negócio"
        onAction={() => {
          setCreateDefaultStageId(currentStage?.id ?? stages[0]?.id)
          setShowCreateModal(true)
        }}
      />

      <PipelineSettings onSelect={setPipelineId} onChanged={loadPipeline} />
      {error && (
        <div className="px-4 pt-4 medium:px-5">
          <Notice tone="danger">{error}</Notice>
        </div>
      )}

      {/* Celular: uma etapa por vez. Arrastar card entre colunas num visor de
          390px não funciona; aqui troca-se de etapa pelas abas e move-se o
          negócio pelo "Mover para…" do próprio card, em dois toques. */}
      <div className="medium:hidden">
        <div className="scroll-chips flex gap-2 px-4 py-3" role="tablist" aria-label="Etapas do funil">
          {stages.map((stage) => {
            const stageLeads = leads.filter((l) => l.stage_id === stage.id)
            const active = stage.id === currentStage?.id
            return (
              <button
                key={stage.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveStageId(stage.id)}
                className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-full border px-3.5 text-sm font-medium transition ${
                  active ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <span className="size-2 rounded-full" style={{ backgroundColor: stage.color }} aria-hidden="true" />
                {stage.name}
                <span className="rounded-full bg-slate-100 px-1.5 text-xs font-semibold text-slate-600">{stageLeads.length}</span>
              </button>
            )
          })}
        </div>
        {loading && <p className="px-4 py-6 text-sm text-slate-500">Carregando funil…</p>}
        {!loading && currentStage && (
          <section role="tabpanel" aria-label={currentStage.name} className="space-y-3 px-4 pb-6">
            <p className="text-sm text-slate-500">
              {currentStageLeads.length} negócio(s) · <span className="font-semibold text-slate-800">{formatCurrency(currentStageLeads.reduce((acc, l) => acc + (l.value_cents || 0), 0))}</span>
            </p>
            {currentStageLeads.map((lead) => (
              <LeadCard key={lead.id} lead={lead} stages={stages} onStageChange={handleStageChange} onClick={() => setSelectedLead(lead)} />
            ))}
            {currentStageLeads.length === 0 && (
              <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">Nenhum negócio nesta etapa.</p>
            )}
            <button
              type="button"
              className="min-h-11 w-full rounded-lg border border-dashed border-slate-300 text-sm font-semibold text-slate-600 hover:border-slate-400"
              onClick={() => {
                setCreateDefaultStageId(currentStage.id)
                setShowCreateModal(true)
              }}
            >
              + Adicionar nesta etapa
            </button>
          </section>
        )}
      </div>

      {/* Tablet: colunas de 280px com encaixe ao rolar. Computador: o quadro
          inteiro, cada etapa dividindo a largura. */}
      <div className="hidden snap-x snap-mandatory overflow-x-auto p-5 medium:block expanded:snap-none">
        <div
          className="grid gap-4 rounded-xl bg-white p-4 [grid-template-columns:repeat(var(--etapas),280px)] expanded:[grid-template-columns:repeat(var(--etapas),minmax(240px,1fr))]"
          style={{ '--etapas': Math.max(stages.length, 1) } as React.CSSProperties}
        >
          {loading && <p className="p-4 text-sm text-slate-400">Carregando funil...</p>}
          {!loading &&
            stages.map((stage) => {
              const stageLeads = leads.filter((l) => l.stage_id === stage.id)
              const stageValue = stageLeads.reduce((acc, l) => acc + (l.value_cents || 0), 0)
              return (
                <div key={stage.id} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const leadId=e.dataTransfer.getData("text/crm-lead");if(leadId) void handleStageChange(leadId,stage.id)}} className="flex min-h-[560px] snap-start flex-col justify-between rounded-xl border border-slate-200 bg-slate-50/60 p-3">
                  <div>
                    <div
                      className="border-b-2 pb-2.5 flex items-center justify-between"
                      style={{ borderColor: stage.color }}
                    >
                      <div>
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900">
                          {stage.name}
                        </h4>
                        <p className="text-[11px] font-semibold text-slate-500">
                          {formatCurrency(stageValue)}
                        </p>
                      </div>
                      <span className="rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-bold text-slate-700">
                        {stageLeads.length}
                      </span>
                    </div>

                    <div className="mt-3 space-y-3">
                      {stageLeads.map((lead) => (
                        <div key={lead.id} draggable onDragStart={e=>e.dataTransfer.setData("text/crm-lead",lead.id)}><LeadCard
                          key={lead.id}
                          lead={lead}
                          stages={stages}
                          onStageChange={handleStageChange}
                          onClick={() => setSelectedLead(lead)}
                        /></div>
                      ))}
                    </div>

                    {stageLeads.length === 0 && (
                      <p className="p-6 text-center text-xs text-slate-500">Sem leads nesta etapa.</p>
                    )}
                  </div>

                  <button
                    type="button"
                    className="mt-3 min-h-11 w-full rounded-lg border border-dashed border-slate-300 text-center text-xs font-semibold text-slate-500 hover:border-slate-400 hover:text-slate-800 transition"
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
              className="min-h-11 w-full rounded-lg border border-slate-200 bg-slate-50 px-2 text-[11px] font-semibold text-slate-700 outline-none hover:bg-slate-100 expanded:min-h-8"
              aria-label={`Mover ${lead.title} para outra etapa`}
              value={lead.stage_id ?? ''}
              onChange={(e) => onStageChange(lead.id, e.target.value)}
            >
              {stages.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id === lead.stage_id ? `Etapa: ${s.name}` : `Mover para ${s.name}`}
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
  const [selectedCompany,setSelectedCompany] = useState<string>()
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
      <Topbar title="Empresas" tab={`${total} empresa(s)`} action="+ Nova empresa" onAction={() => setShowModal(true)} />
      <div className="space-y-4 p-4 medium:p-5">
        <input type="search" className="input max-w-md" aria-label="Buscar empresas" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome, CNPJ, site ou e-mail" />
        {error && <Notice tone="danger">{error}</Notice>}
        <DataTable
          columns={['Empresa', 'CNPJ', 'Domínio / Site', 'Telefone', 'E-mail', 'Contatos Vinculados', 'Ações']}
          cards={
            <CardList>
              {loading && companies.length === 0 && <CardMessage text="Carregando empresas…" />}
              {!loading && companies.length === 0 && <CardMessage text={search ? 'Nenhuma empresa encontrada.' : 'Nenhuma empresa cadastrada ainda.'} />}
              {companies.map((company) => (
                <li key={company.id} className="flex min-h-16 items-center gap-3 px-4 py-3">
                  <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700" aria-hidden="true">
                    {initials(company.name)}
                  </span>
                  <button type="button" className="min-h-11 min-w-0 flex-1 text-left" onClick={() => setSelectedCompany(company.id)}>
                    <span className="block truncate font-medium text-slate-900">{company.name}</span>
                    <span className="block truncate text-sm text-slate-500">
                      {[company.cnpj, company.phone ? formatPhoneBR(company.phone) : null, `${company.contacts_count ?? 0} contato(s)`].filter(Boolean).join(' · ')}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-500 hover:bg-red-50 hover:text-red-600"
                    aria-label={`Excluir ${company.name}`}
                    onClick={() => handleDeleteCompany(company.id)}
                  >
                    <Trash2 size={17} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </CardList>
          }
        >
          {loading && <TableMessage colSpan={7} text="Carregando empresas..." />}
          {!loading && companies.length === 0 && <TableMessage colSpan={7} text="Nenhuma empresa cadastrada." />}
          {companies.map((company) => (
            <tr key={company.id} className="border-b border-slate-100 hover:bg-slate-50/50">
              <td className="px-4 py-3 font-semibold text-slate-900"><button className="text-blue-700 underline" onClick={()=>setSelectedCompany(company.id)}>{company.name}</button></td>
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

      {selectedCompany&&<CompanyDetails id={selectedCompany} onClose={()=>setSelectedCompany(undefined)} onSaved={loadCompanies}/>}
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
  const [editingTask,setEditingTask] = useState<CrmTask | undefined>()
  const [tasks, setTasks] = useState<CrmTask[]>([])
  const [tabFilter, setTabFilter] = useState<'open' | 'completed' | 'all'>('open')
  const [search, setSearch] = useState('')
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showModal, setShowModal] = useState(false)


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


  return (
    <div>
      <Topbar title="Tarefas & Lembretes" tab={`${total} tarefa(s)`} action="+ Nova Tarefa" onAction={() => setShowModal(true)} />
      <div className="p-6 space-y-4"><ReminderList />
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
                <div key={task.id} className={`flex flex-col items-stretch gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-100 p-4 transition ${isCompleted ? 'bg-slate-50/70' : 'hover:bg-slate-50'}`}>
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
                  <div className="flex flex-wrap items-center gap-2 shrink-0">
                    <button onClick={()=>{setEditingTask(task);setShowModal(true)}} className="rounded border px-2 py-1 text-sm">Editar</button><span className={`rounded px-2 py-0.5 text-xs font-semibold ${priorityColor}`}>{priorityLabel}</span>
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

      {showModal && <TaskEditor task={editingTask} onClose={()=>{setShowModal(false);setEditingTask(undefined)}} onSaved={()=>{void listTasks({status:tabFilter,search}).then(r=>{setTasks(r.tasks);setTotal(r.pagination.total)}).catch(e=>setError(e.message))}} />}
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
  const [importOpen, setImportOpen] = useState(false)
  const { canManage } = useSession()

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
      <ContactCreate onCreated={loadContacts} />
      {canManage && (
        <div className="flex justify-end px-4 pt-3 medium:px-6">
          <button type="button" className={buttonClass.secondary} onClick={() => setImportOpen(true)}>
            <FileUp size={16} aria-hidden="true" />
            Importar contatos
          </button>
        </div>
      )}
      <ImportContactsSheet open={importOpen} onClose={() => setImportOpen(false)} onImported={loadContacts} />
      <DataTable
        columns={['Nome', 'Empresa', 'Telefone', 'E-mail', 'Origem', 'Atualizado']}
        cards={
          <CardList>
            {loading && contacts.length === 0 && <CardMessage text="Carregando contatos…" />}
            {!loading && contacts.length === 0 && <CardMessage text={search ? 'Nenhum contato encontrado.' : 'Nenhum contato ainda. Quem escreve no WhatsApp entra aqui sozinho, e você pode importar sua planilha ou a agenda do celular.'} />}
            {contacts.map((contact) => (
              <CardRow
                key={contact.id}
                title={contact.name}
                detail={[formatPhoneBR(contact.phone), contact.company].filter(Boolean).join(' · ') || contact.email || 'Sem telefone'}
                onClick={() => setSelectedContactId(contact.id)}
              />
            ))}
          </CardList>
        }
      >
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
            <td className="whitespace-nowrap px-4 py-3 tabular-nums text-slate-600">{contact.phone ? formatPhoneBR(contact.phone) : '-'}</td>
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
      <DataTable
        columns={['Oportunidade', 'Contato', 'Empresa', 'Etapa', 'Valor', 'Status']}
        cards={
          <CardList>
            {loading && leads.length === 0 && <CardMessage text="Carregando leads…" />}
            {!loading && leads.length === 0 && <CardMessage text={search ? 'Nenhum lead encontrado.' : 'Nenhum lead ainda. Crie o primeiro no Funil ou a partir de uma conversa.'} />}
            {leads.map((lead) => (
              <CardRow
                key={lead.id}
                title={lead.title}
                detail={[lead.contact_name, lead.stage_name].filter(Boolean).join(' · ') || 'Sem contato'}
                aside={<span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900">{formatCurrency(lead.value_cents)}</span>}
                onClick={() => setSelectedLead(lead)}
              />
            ))}
          </CardList>
        }
      >
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
      <div className="space-y-4 p-4 medium:p-5">
        <input
          type="search"
          className="input max-w-md"
          aria-label={`Buscar em ${title}`}
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Buscar…"
        />
        {error && <Notice tone="danger">{error}</Notice>}
        {children}
      </div>
    </div>
  )
}

/**
 * Tabela que vira lista de cartões no celular.
 *
 * Abaixo de 600px aparece `cards`: nome em destaque e dois dados que importam.
 * Acima, a tabela, com a primeira coluna presa à esquerda para não se perder de
 * quem é a linha ao rolar para o lado.
 */
function DataTable({ columns, cards, children }: { columns: string[]; cards?: React.ReactNode; children: React.ReactNode }) {
  return (
    <>
      {cards && <div className="medium:hidden">{cards}</div>}
      <div className={`${cards ? 'hidden medium:block' : ''} overflow-auto rounded-xl border border-slate-200 bg-white`}>
        <table className="w-full min-w-[860px] border-collapse text-sm [&_td:first-child]:sticky [&_td:first-child]:left-0 [&_td:first-child]:bg-white [&_th:first-child]:sticky [&_th:first-child]:left-0 [&_th:first-child]:bg-slate-50">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>{columns.map((column) => <th key={column} className="border-b border-slate-200 px-4 py-3">{column}</th>)}</tr>
          </thead>
          <tbody>{children}</tbody>
        </table>
      </div>
    </>
  )
}

function CardList({ children }: { children: React.ReactNode }) {
  return <ul className="divide-y divide-slate-100 overflow-hidden rounded-xl border border-slate-200 bg-white">{children}</ul>
}

function CardRow({ title, detail, aside, onClick }: { title: string; detail: string; aside?: React.ReactNode; onClick: () => void }) {
  return (
    <li>
      <button type="button" className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50" onClick={onClick}>
        <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700" aria-hidden="true">
          {initials(title)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium text-slate-900">{title}</span>
          <span className="block truncate text-sm text-slate-500">{detail}</span>
        </span>
        {aside}
        <ChevronRight size={18} className="shrink-0 text-slate-400" aria-hidden="true" />
      </button>
    </li>
  )
}

function CardMessage({ text }: { text: string }) {
  return <li className="px-4 py-6 text-center text-sm text-slate-500">{text}</li>
}

export default Workspace


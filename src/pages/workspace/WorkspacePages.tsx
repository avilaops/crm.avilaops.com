import { useEffect, useState } from 'react'
import { Archive, MessageCircle, MoreHorizontal, Plus, Search, X } from 'lucide-react'
import type { LeadSource } from '../../components/modals/LeadSourceModal'
import { archiveConversation, listConversationMessages, listConversations, type CrmConversation, type CrmMessage } from '../../lib/crm'
import type { Page } from '../../types'

function Workspace({ page, setPage, openLeadSource }: { page: Page; setPage: (page: Page) => void; openLeadSource: (source: LeadSource) => void }) {
  if (page === 'home') return <HomePage setPage={setPage} openLeadSource={openLeadSource} />
  if (page === 'chat-inbox') return <ChatInbox openLeadSource={openLeadSource} />
  if (page === 'mail-inbox') return <SimpleTable title="Caixa de entrada" tab="Inbox de email" columns={['De', 'Mensagem e conexão de lead', 'Data']} empty="Desculpe, não há mensagens." action="Escrever" />
  if (page === 'team-chat') return <TeamChat />
  if (page === 'pipeline') return <Pipeline />
  if (page === 'leads') return <SimpleTable title="Leads" tab="Leads ativos" columns={['Lead título', 'Contato principal', 'Empresa do contato', 'Etapa do lead', 'Venda, R$']} empty="Desculpe, nenhum lead encontrado. Mostrar tudo" action="+ Novo lead" />
  if (page === 'calendar') return <CalendarPage />
  if (page === 'contacts') return <SimpleTable title="Contatos" tab="Lista completa" columns={['Nome', 'Empresa', 'Telefone', 'E-mail']} empty="Desculpe, nenhum contato encontrado. Mostrar tudo" action="+ Adicionar contato" />
  if (page === 'companies') return <SimpleTable title="Empresas" tab="Lista completa" columns={['Empresa', 'Telefone', 'Responsável', 'Status']} empty="Nenhuma empresa encontrada." action="+ Adicionar empresa" />
  if (page === 'all-contacts') return <SimpleTable title="Todos os contatos e empresas" tab="Lista completa" columns={['Nome', 'Tipo', 'Telefone', 'E-mail']} empty="Nenhum registro encontrado." action="+ Adicionar" />
  if (page === 'media') return <EmptyFeature title="Mídia" body="Arquivos, imagens e documentos usados nas conversas ficarão aqui." />
  if (page === 'products') return <EmptyFeature title="Produtos" body="Cadastre produtos e use catálogos em mensagens e automações." />
  if (page === 'segments') return <EmptyFeature title="Segmentos" body="Crie públicos por tags, comportamento, origem e etapa do funil." />
  if (page === 'ai-agent') return <EmptyFeature title="Agente de IA" body="Configure recepcionistas, sugestões e preenchimento automático de perfis." />
  if (page === 'automations') return <EmptyFeature title="Automações" body="Crie gatilhos ao mover etapas, receber mensagens ou vencer tarefas." />
  return <HomePage setPage={setPage} openLeadSource={openLeadSource} />
}

export function Topbar({ title, tab, action }: { title: string; tab?: string; action?: string }) {
  return (
    <header className="flex h-16 items-center gap-4 border-b border-slate-200 bg-white px-5">
      <h2 className="min-w-32 text-base font-bold uppercase tracking-wide">{title}</h2>
      <div className="relative flex-1">
        <Search className="absolute left-3 top-2.5 text-slate-400" size={16} />
        <input className="w-full rounded border-0 py-2 pl-9 text-sm outline-none" placeholder="Pesquisar e filtrar" />
      </div>
      {tab && <span className="rounded bg-lime-100 px-2 py-1 text-sm text-lime-700">{tab}</span>}
      <button className="rounded border border-slate-200 px-3 py-2 text-sm font-semibold">
        <MoreHorizontal size={16} />
      </button>
      {action && <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{action}</button>}
    </header>
  )
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
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    listConversations()
      .then((data) => {
        if (!active) return
        setConversations(data.conversations)
        setSelectedId(data.conversations[0]?.id ?? null)
      })
      .catch((err: Error) => active && setError(err.message))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [])

  useEffect(() => {
    if (!selectedId) {
      setMessages([])
      return
    }
    let active = true
    listConversationMessages(selectedId)
      .then((data) => active && setMessages(data.messages))
      .catch((err: Error) => active && setError(err.message))
    return () => {
      active = false
    }
  }, [selectedId])

  const selected = conversations.find((conversation) => conversation.id === selectedId) ?? null
  const waitingCount = conversations.filter((conversation) => conversation.status === 'waiting').length

  return (
    <div>
      <Topbar title="Caixa de entrada" />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <span className="rounded bg-lime-100 px-2 py-1 text-xs text-lime-700">Conversas abertas</span>
            <span className="float-right text-xs text-slate-400">Total: {conversations.length}</span>
            {waitingCount > 0 && <p className="mt-2 text-xs font-semibold text-amber-600">{waitingCount} cliente(s) aguardando resposta</p>}
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
                onClick={() => setSelectedId(conversation.id)}
              >
                <div className="flex items-start gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold">
                    {(conversation.contact_name ?? conversation.contact_phone ?? '?').slice(0, 2).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate font-semibold">{conversation.contact_name ?? conversation.contact_phone ?? 'Contato sem nome'}</p>
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
                <div>
                  <h3 className="font-semibold">{selected.contact_name ?? selected.contact_phone ?? 'Contato'}</h3>
                  <p className="text-xs text-slate-500">{selected.channel_name ?? 'WhatsApp'} · {selected.status}</p>
                </div>
                <button
                  className="inline-flex items-center gap-2 rounded border border-slate-200 px-3 py-2 text-sm font-semibold"
                  onClick={() => archiveConversation(selected.id).then(() => setConversations((items) => items.map((item) => item.id === selected.id ? { ...item, status: 'archived' } : item)))}
                >
                  <Archive size={15} />
                  Arquivar
                </button>
              </div>
              <div className="flex-1 space-y-3 overflow-auto p-5">
                {messages.length === 0 && <p className="mt-12 text-center text-sm text-slate-400">Nenhuma mensagem gravada para esta conversa.</p>}
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.direction === 'inbound' ? 'justify-start' : 'justify-end'}`}>
                    <div className={`max-w-[72%] rounded px-4 py-3 text-sm shadow-sm ${message.direction === 'inbound' ? 'bg-white' : 'bg-blue-600 text-white'}`}>
                      <p>{message.body}</p>
                      <p className={`mt-2 text-xs ${message.direction === 'inbound' ? 'text-slate-400' : 'text-blue-100'}`}>{new Date(message.sent_at).toLocaleString('pt-BR')}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
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

function TeamChat() {
  return (
    <div>
      <Topbar title="Chats da equipe" />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white p-4">
          <span className="rounded bg-lime-100 px-2 py-1 text-xs text-lime-700">Todos</span>
          {['Chat com suporte', 'Relatório agendado', 'Convidar membros da equipe'].map((item, index) => (
            <div key={item} className="mt-4 flex items-center gap-4 border-b border-slate-100 pb-4">
              <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-100">{index === 2 ? <Plus /> : <MessageCircle />}</div>
              <div>
                <p className="font-semibold">{item}</p>
                {index === 2 && <p className="text-sm text-slate-500">Colaborar & vender juntos</p>}
              </div>
            </div>
          ))}
        </aside>
        <section className="grid place-items-center bg-slate-50 text-center">
          <div>
            <h3 className="text-lg font-medium">Converse com sua equipe dentro da Agenda</h3>
            <p className="mt-2 max-w-md text-sm text-slate-500">Envie mensagens a colegas, compartilhe arquivos e mantenha-se alinhado em todas as decisões.</p>
            <button className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Convidar membros da equipe</button>
          </div>
        </section>
      </div>
    </div>
  )
}

function Pipeline() {
  return (
    <div>
      <Topbar title="Leads" tab="Leads ativos" action="+ Novo lead" />
      <div className="overflow-auto p-5">
        <div className="grid min-w-[980px] grid-cols-4 gap-4 rounded bg-white p-4">
          {['Leads de entrada', 'Decidindo', 'Discussão de contrato', 'Decisão final'].map((stage, index) => (
            <div key={stage} className="min-h-[520px]">
              <div className="border-b-4 pb-2 text-center text-sm font-bold uppercase tracking-[0.14em]" style={{ borderColor: ['#facc15', '#a855f7', '#7dd957', '#3b82f6'][index] }}>
                {stage}
              </div>
              <LeadCard name={['Mary Chan', 'Lisa Runner', 'Agnes Ruiz', 'Aaron Mayers'][index]} company={['Consulta de Marketing', 'Consulta de RP', 'Análise social media', 'Consulta social media'][index]} value={['R$450', 'R$450', 'R$5.000', 'R$5.000'][index]} />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LeadCard({ name, company, value }: { name: string; company: string; value: string }) {
  return (
    <div className="mt-4 rounded border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-full bg-slate-200 text-xs font-bold">{name[0]}</div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{name}</p>
          <p className="truncate text-sm font-semibold text-blue-700">{company}</p>
          <p className="mt-1 text-xs text-slate-500">{value} <span className="rounded border px-1">Urgente</span></p>
        </div>
      </div>
    </div>
  )
}

function SimpleTable({ title, tab, columns, empty, action }: { title: string; tab: string; columns: string[]; empty: string; action: string }) {
  return (
    <div>
      <Topbar title={title} tab={tab} action={action} />
      <div className="p-5">
        <div className="overflow-hidden bg-white">
          <div className="grid border-b border-slate-200 text-xs font-bold uppercase text-slate-400" style={{ gridTemplateColumns: `repeat(${columns.length}, minmax(160px, 1fr))` }}>
            {columns.map((column) => <div key={column} className="border-r border-slate-100 p-4">{column}</div>)}
          </div>
          <p className="p-4 text-sm text-red-400">{empty}</p>
        </div>
      </div>
    </div>
  )
}

function CalendarPage() {
  const days = ['Seg. 20 Jul. 2026', 'Ter 21', 'Qua 22', 'Qui 23', 'Sex 24', 'Sáb 25', 'Dom 26']
  return (
    <div>
      <Topbar title="Calendário" tab="Meus eventos" action="+ Novo evento" />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[80px_repeat(7,minmax(120px,1fr))] overflow-auto bg-white text-sm text-slate-400">
        <div className="border-b border-r border-slate-200 p-3">Dia todo</div>
        {days.map((day) => <div key={day} className="border-b border-r border-slate-200 p-3 text-center">{day}</div>)}
        {Array.from({ length: 14 }).map((_, row) => (
          <>
            <div key={`time-${row}`} className="border-r border-slate-200 p-3 text-right">{String(row + 8).padStart(2, '0')}:00</div>
            {days.map((day, col) => <div key={`${day}-${row}`} className={`h-14 border-r border-t border-slate-100 ${col === 3 ? 'bg-blue-50/40' : ''}`} />)}
          </>
        ))}
      </div>
    </div>
  )
}

function EmptyFeature({ title, body }: { title: string; body: string }) {
  return (
    <div>
      <Topbar title={title} />
      <div className="grid min-h-[calc(100vh-4rem)] place-items-center p-8 text-center">
        <div>
          <h3 className="text-xl font-semibold">{title}</h3>
          <p className="mt-2 max-w-md text-slate-500">{body}</p>
        </div>
      </div>
    </div>
  )
}


export default Workspace


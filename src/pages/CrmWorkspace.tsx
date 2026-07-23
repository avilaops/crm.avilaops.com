import {
  Bell,
  Bot,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleHelp,
  FileText,
  Home,
  KanbanSquare,
  LayoutGrid,
  Link2,
  MessageCircle,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Sparkles,
  UsersRound,
  X,
} from 'lucide-react'
import { useEffect, useState } from 'react'

export type Screen = 'accounts' | 'app'
export type Page =
  | 'home'
  | 'chat-inbox'
  | 'mail-inbox'
  | 'team-chat'
  | 'pipeline'
  | 'leads'
  | 'calendar'
  | 'segments'
  | 'contacts'
  | 'companies'
  | 'all-contacts'
  | 'media'
  | 'products'
  | 'ai-agent'
  | 'automations'
  | 'profile-settings'
  | 'workspace-settings'
  | 'chat-settings'
  | 'mail-settings'
  | 'billing'
  | 'users'
  | 'ai-settings'
  | 'knowledge'
  | 'integrations'

const navGroups = [
  {
    items: [
      { id: 'home', label: 'Início', icon: Home },
      {
        id: 'communications',
        label: 'Comunicações',
        icon: MessageCircle,
        children: [
          { id: 'chat-inbox', label: 'Inbox de chat' },
          { id: 'mail-inbox', label: 'Inbox de email' },
          { id: 'team-chat', label: 'Chats da equipe' },
        ],
      },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: KanbanSquare,
        children: [
          { id: 'pipeline', label: 'Funil de vendas' },
          { id: 'leads', label: 'Todos os leads' },
        ],
      },
      { id: 'calendar', label: 'Calendário', icon: CalendarDays },
      { id: 'segments', label: 'Segmentos', icon: UsersRound, badge: 'Beta' },
      {
        id: 'lists',
        label: 'Listas',
        icon: FileText,
        children: [
          { id: 'contacts', label: 'Contatos' },
          { id: 'companies', label: 'Empresas' },
          { id: 'all-contacts', label: 'Todos os contatos e empresas' },
          { id: 'media', label: 'Mídia' },
          { id: 'products', label: 'Produtos' },
        ],
      },
      { id: 'ai-agent', label: 'Agente de IA', icon: Sparkles },
      { id: 'automations', label: 'Automações', icon: Bot },
    ],
  },
]

const settingsItems = [
  ['Perfil', 'profile-settings', 'Configurações de perfil'],
  ['Área de trabalho', 'workspace-settings', 'Configurações de trabalho'],
  ['Área de trabalho', 'chat-settings', 'Configurações de chat'],
  ['Área de trabalho', 'mail-settings', 'Configurações de email'],
  ['Área de trabalho', 'billing', 'Faturamento'],
  ['Área de trabalho', 'users', 'Gestão de usuários'],
  ['IA', 'ai-settings', 'Configurações de IA'],
  ['IA', 'knowledge', 'Fontes de conhecimento'],
  ['Integrações e canais', 'integrations', 'Central de integrações'],
] as const

const integrations = [
  'WhatsApp Business',
  'TikTok',
  'Instagram',
  'Facebook',
  'Telegram',
  'Slack',
  'Wazzup',
  'Google Sheets',
  'Webhooks',
  'Zapier',
  'Make',
  'Stripe',
  'PayPal',
  'Asaas',
  'Google Agenda',
  'Zoom',
  'Twilio',
  'OpenAI',
  'Shopify',
  'WooCommerce',
  'RD Station',
  'HubSpot',
  'Pipedrive',
  'Jotform',
  'Typeform',
  'Dropbox',
  'Google Drive',
  'Clicksign',
]

type CrmWorkspaceProps = {
  initialPage: Page
  onPageChange: (page: Page) => void
}

function CrmWorkspace({ initialPage, onPageChange }: CrmWorkspaceProps) {
  const [screen, setScreen] = useState<Screen>('accounts')
  const [page, setPageState] = useState<Page>(initialPage)
  const [whatsappModal, setWhatsappModal] = useState(false)
  const [knowledgeModal, setKnowledgeModal] = useState(false)

  useEffect(() => {
    setPageState(initialPage)
  }, [initialPage])

  const setPage = (nextPage: Page) => {
    setPageState(nextPage)
    onPageChange(nextPage)
  }

  if (screen === 'accounts') {
    return <AccountSelect onEnter={() => setScreen('app')} />
  }

  const inSettings = page.includes('settings') || page === 'billing' || page === 'users' || page === 'knowledge' || page === 'integrations'

  return (
    <main className="min-h-screen bg-[#f3f3f3] text-slate-800">
      <div className="grid min-h-screen grid-cols-[232px_minmax(0,1fr)] xl:grid-cols-[232px_minmax(0,1fr)_320px]">
        <Sidebar page={page} setPage={setPage} />
        <section className="min-w-0 border-r border-slate-200">
          {inSettings ? (
            <SettingsShell page={page} setPage={setPage} openKnowledge={() => setKnowledgeModal(true)} />
          ) : (
            <Workspace page={page} setPage={setPage} openWhatsApp={() => setWhatsappModal(true)} />
          )}
        </section>
        <Copilot />
      </div>
      {whatsappModal && <WhatsAppModal onClose={() => setWhatsappModal(false)} />}
      {knowledgeModal && <KnowledgeModal onClose={() => setKnowledgeModal(false)} />}
    </main>
  )
}

function AccountSelect({ onEnter }: { onEnter: () => void }) {
  return (
    <main className="min-h-screen bg-white px-6 py-10 text-[#080034]">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-center text-3xl font-bold">Bem-vindo de volta, Nicolas Rosa</h1>
        <div className="mt-9 rounded-md bg-[#f7f4ff] px-6 py-8 text-center">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-yellow-300 text-3xl font-bold text-slate-950">NR</div>
          <p className="mt-4 font-semibold text-[#8b81a8]">nicolasrosadb@gmail.com</p>
          <div className="mt-7 flex flex-wrap justify-center gap-6 text-sm font-semibold">
            <button>Criar outra conta</button>
            <button>Acesse o portal do parceiro</button>
            <button>Sair</button>
          </div>
        </div>
        <h2 className="mt-9 text-center text-2xl font-bold">Selecione uma conta</h2>
        <button className="mt-7 flex w-full items-center justify-between rounded-md px-2 py-4 text-left hover:bg-slate-50" onClick={onEnter}>
          <span className="flex items-center gap-4">
            <span className="rounded-md bg-yellow-200 px-8 py-2 text-xs font-semibold">Teste</span>
            <span className="font-bold">nicolasrosadb</span>
          </span>
          <ChevronRight />
        </button>
      </section>
    </main>
  )
}

function Sidebar({ page, setPage }: { page: Page; setPage: (page: Page) => void }) {
  return (
    <aside className="flex min-h-screen flex-col border-r border-slate-200 bg-white">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <div className="text-2xl font-black italic text-slate-800">Agenda</div>
        <LayoutGrid size={16} className="text-slate-500" />
      </div>
      <nav className="flex-1 overflow-auto p-1 text-sm">
        {navGroups.map((group, groupIndex) => (
          <div key={groupIndex} className="space-y-1">
            {group.items.map((item) => {
              const Icon = item.icon
              const isParentActive = item.id === page || item.children?.some((child) => child.id === page)
              return (
                <div key={item.id}>
                  <button
                    className={`flex w-full items-center gap-3 rounded px-4 py-2 text-left ${
                      isParentActive && !item.children ? 'bg-blue-100 font-semibold text-blue-700' : 'hover:bg-slate-100'
                    }`}
                    onClick={() => !item.children && setPage(item.id as Page)}
                  >
                    <Icon size={16} />
                    <span className="flex-1">{item.label}</span>
                    {item.badge && <span className="rounded bg-violet-100 px-2 py-0.5 text-xs text-violet-700">{item.badge}</span>}
                  </button>
                  {item.children && (
                    <div className="ml-9 mt-1 space-y-1">
                      {item.children.map((child) => (
                        <button
                          key={child.id}
                          className={`block w-full truncate rounded px-3 py-2 text-left ${
                            page === child.id ? 'bg-blue-100 font-semibold text-blue-700' : 'text-slate-600 hover:bg-slate-100'
                          }`}
                          onClick={() => setPage(child.id as Page)}
                        >
                          {child.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ))}
      </nav>
      <div className="border-t border-slate-200 p-2 text-sm">
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100" onClick={() => setPage('profile-settings')}>
          <Settings size={16} />
          Configurações
        </button>
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100">
          <CircleHelp size={16} />
          Ajuda
        </button>
        <button className="flex w-full items-center gap-3 rounded px-4 py-2 hover:bg-slate-100">
          <Bell size={16} />
          Centro de Notificação
          <span className="ml-auto rounded-full bg-red-500 px-1.5 text-xs text-white">2</span>
        </button>
        <div className="mt-3 flex items-center gap-3 px-3 py-2">
          <div className="grid h-9 w-9 place-items-center rounded-full bg-yellow-300 text-xs font-bold">NR</div>
          <div className="min-w-0">
            <p className="truncate font-medium">Nicolas Rosa</p>
            <p className="truncate text-xs text-slate-500">nicolasrosaab</p>
          </div>
        </div>
      </div>
    </aside>
  )
}

function Workspace({ page, setPage, openWhatsApp }: { page: Page; setPage: (page: Page) => void; openWhatsApp: () => void }) {
  if (page === 'home') return <HomePage setPage={setPage} openWhatsApp={openWhatsApp} />
  if (page === 'chat-inbox') return <ChatInbox openWhatsApp={openWhatsApp} />
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
  return <HomePage setPage={setPage} openWhatsApp={openWhatsApp} />
}

function Topbar({ title, tab, action }: { title: string; tab?: string; action?: string }) {
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

function HomePage({ setPage, openWhatsApp }: { setPage: (page: Page) => void; openWhatsApp: () => void }) {
  return (
    <div>
      <Topbar title="Início" />
      <div className="mx-auto max-w-5xl space-y-5 p-6">
        <section className="relative overflow-hidden rounded bg-white p-8">
          <button className="absolute right-4 top-4 text-slate-400"><X size={16} /></button>
          <p className="text-sm text-slate-500">Boas-vindas à Agenda!</p>
          <h1 className="mt-3 max-w-md text-3xl font-bold">Converta chats em vendas com IA poderosa</h1>
          <button className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white" onClick={openWhatsApp}>Explore a Agenda</button>
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
            <Tutorial title="Conecte um canal" button="Conectar canal" onClick={openWhatsApp} />
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

function ChatInbox({ openWhatsApp }: { openWhatsApp: () => void }) {
  return (
    <div>
      <Topbar title="Caixa de entrada" />
      <div className="grid min-h-[calc(100vh-4rem)] grid-cols-[360px_minmax(0,1fr)]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-4">
            <span className="rounded bg-lime-100 px-2 py-1 text-xs text-lime-700">Conversas abertas</span>
            <span className="float-right text-xs text-slate-400">Total: 0</span>
          </div>
          <button className="flex w-full gap-4 border-b border-slate-100 p-4 text-left" onClick={openWhatsApp}>
            <span className="grid h-11 w-11 place-items-center rounded-full border border-dashed border-slate-400">
              <Plus size={18} />
            </span>
            <span>
              <span className="block font-semibold">Adicionar canais</span>
              <span className="text-sm text-slate-500">Capture leads do WhatsApp & mais!</span>
            </span>
          </button>
          <p className="p-8 text-center text-sm text-slate-400">Nenhuma conversa encontrada</p>
        </aside>
        <section className="relative grid place-items-center bg-slate-50">
          <div className="max-w-lg text-center text-slate-600">
            <p>Conecte seus canais para receber e responder a todas as mensagens em um só lugar.</p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold" onClick={openWhatsApp}>Conectar WhatsApp</button>
              <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Conectar TikTok</button>
              <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Conectar Instagram</button>
              <button className="rounded border border-slate-200 bg-white px-3 py-2 text-sm font-semibold">Conectar Facebook</button>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
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

function SettingsShell({ page, setPage, openKnowledge }: { page: Page; setPage: (page: Page) => void; openKnowledge: () => void }) {
  return (
    <div className="grid min-h-screen grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-5 text-sm font-bold uppercase">Configurações</h2>
        <div className="p-4 text-sm">
          {['Perfil', 'Área de trabalho', 'IA', 'Integrações e canais'].map((group) => (
            <div key={group} className="mb-5">
              <p className="mb-2 text-xs font-semibold text-slate-400">{group}</p>
              {settingsItems.filter(([section]) => section === group).map(([, id, label]) => (
                <button key={id} className={`block w-full truncate rounded px-3 py-2 text-left ${page === id ? 'bg-blue-100 font-semibold text-blue-700' : 'hover:bg-slate-100'}`} onClick={() => setPage(id as Page)}>
                  {label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </aside>
      <section className="bg-[#f3f3f3]">
        {page === 'profile-settings' && <ProfileSettings />}
        {page === 'billing' && <Billing />}
        {page === 'users' && <Users />}
        {page === 'ai-settings' && <AISettings />}
        {page === 'knowledge' && <Knowledge openKnowledge={openKnowledge} />}
        {page === 'integrations' && <IntegrationCenter />}
        {!['profile-settings', 'billing', 'users', 'ai-settings', 'knowledge', 'integrations'].includes(page) && <GenericSettings title={settingsItems.find(([, id]) => id === page)?.[2] || 'Configurações'} />}
      </section>
    </div>
  )
}

function SettingsHeader({ title }: { title: string }) {
  return <header className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6"><h2 className="font-bold">{title}</h2><button className="rounded bg-white px-3 py-2 text-sm shadow-sm">Salvar</button></header>
}

function ProfileSettings() {
  const notifications = ['Caixa de entrada', 'Menções e team chat', 'Chat da equipe', 'Chamadas', 'Emails recebidos', 'Faturamento', 'Leads de entrada', 'Tarefas: 5 minutos antes da tarefa']
  return (
    <div>
      <SettingsHeader title="Configurações de perfil" />
      <div className="space-y-6 p-6">
        <section className="bg-white p-6">
          <div className="grid gap-8 md:grid-cols-[150px_1fr]">
            <div className="grid h-32 w-32 place-items-center rounded-full bg-yellow-300 text-3xl font-bold">NR</div>
            <div className="grid max-w-md gap-3 text-sm">
              <Field label="ID do usuário" value="15605143" />
              <Field label="Idioma" value="Português" />
              <Field label="Nome" value="Nicolas Rosa" />
              <Field label="Telefone" value="+55 17 99781-1471" />
              <Field label="E-mail" value="nicolasrosaab@gmail.com" />
              <Field label="Senha" value="••••••" />
              <label className="grid grid-cols-[120px_1fr] gap-4"><span>Nota</span><textarea className="input min-h-20" /></label>
            </div>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-lg">Segurança</h3>
          <div className="bg-white p-5">
            <p className="font-semibold">Verificação em 2 etapas <span className="ml-2 text-blue-600">—</span></p>
            <p className="mt-2 text-sm text-slate-500">Adicione mais uma etapa de segurança à sua conta.</p>
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-lg">Sessões</h3>
          <div className="bg-white text-sm">
            {['Edge, Win10 | Atual | Ribeirão Preto, Brazil | 2804:7f0:4802:26', 'Safari, iOS | 23/07/2026 16:40 | Campinas, Brazil | 2804:214:9a4b:36'].map((row) => (
              <div key={row} className="grid grid-cols-4 border-b border-slate-100 p-3">{row.split('|').map((cell) => <span key={cell}>{cell}</span>)}</div>
            ))}
          </div>
        </section>
        <section>
          <h3 className="mb-3 text-lg">Configurações de notificação</h3>
          <div className="overflow-hidden bg-white text-sm">
            <div className="grid grid-cols-[1.6fr_1fr_1fr_1fr] border-b border-slate-100 p-3 text-xs font-bold uppercase text-slate-400">
              <span>Configurações avançadas</span><span>E-mail</span><span>Tel. móvel</span><span>Navegador</span>
            </div>
            {notifications.map((item) => (
              <div key={item} className="grid grid-cols-[1.6fr_1fr_1fr_1fr] border-b border-slate-100 p-3">
                <span><Check className="mr-2 inline" size={14} />{item}</span><span>Imediatamente</span><span><Check size={14} /></span><span><Check size={14} /></span>
              </div>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}

function Field({ label, value }: { label: string; value: string }) {
  return <label className="grid grid-cols-[120px_1fr] items-center gap-4"><span>{label}</span><input className="input" defaultValue={value} /></label>
}

function Billing() {
  const [tab, setTab] = useState<'plan' | 'addons' | 'usage'>('plan')
  return (
    <div>
      <SettingsHeader title="Faturamento" />
      <div className="mx-auto max-w-4xl p-8">
        <div className="mb-6 flex justify-center gap-8 border-b border-slate-200">
          {[
            ['plan', 'Meu plano'],
            ['addons', 'Complementos'],
            ['usage', 'Uso'],
          ].map(([id, label]) => (
            <button key={id} className={`px-2 pb-2 ${tab === id ? 'border-b-2 border-blue-600' : ''}`} onClick={() => setTab(id as typeof tab)}>{label}</button>
          ))}
        </div>
        {tab === 'plan' && <PlanTab />}
        {tab === 'addons' && <AddonsTab />}
        {tab === 'usage' && <UsageTab />}
      </div>
    </div>
  )
}

function PlanTab() {
  return (
    <div className="bg-white p-6 shadow-sm">
      <h3 className="text-lg font-semibold">Teste Pro <span className="rounded bg-emerald-100 px-2 py-1 text-xs text-emerald-700">11 dias restantes</span></h3>
      <p className="mt-2 text-slate-500">Explore o que está incluído no Pro durante seu teste.</p>
      {['Transmissão', 'Automação avançada', 'Conexões ilimitadas no WhatsApp e Instagram', 'Agendamentos com agentes de IA', 'Até 50 agentes de IA'].map((item) => (
        <p key={item} className="mt-3"><CheckCircle2 className="mr-2 inline text-emerald-600" size={16} />{item}</p>
      ))}
      <button className="mt-6 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">Assinar o Pro</button>
    </div>
  )
}

function AddonsTab() {
  return (
    <div className="bg-white p-6">
      <h3 className="mb-5 text-lg font-semibold">Complementos disponíveis</h3>
      <div className="grid gap-5 md:grid-cols-2">
        <Addon title="Créditos de IA" price="De US$29/mês" button="Adicionar créditos" />
        <Addon title="API de Chats" price="De US$10/mês" button="Adicionar mensagens" />
      </div>
    </div>
  )
}

function Addon({ title, price, button }: { title: string; price: string; button: string }) {
  return <div className="rounded border border-slate-200 p-5"><h4 className="font-semibold">{title} <span className="float-right font-normal">{price}</span></h4><p className="mt-3 text-slate-500">Expanda os recursos da Agenda com limites adicionais.</p><button className="mt-5 rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white">{button}</button></div>
}

function UsageTab() {
  const rows = ['Leads Ilimitado', 'Contatos e empresas Ilimitado', 'Números de WhatsApp Ilimitado', 'Armazenamento de mídia 0 Bytes / 10 GB', 'Pipelines 1 / 50', 'Campos personalizados Ilimitado']
  return <div className="space-y-5">{rows.map((row) => <div key={row} className="flex justify-between bg-white p-4"><span>{row.split(' ').slice(0, -1).join(' ')}</span><span className="text-blue-600">{row.split(' ').at(-1)}</span></div>)}</div>
}

function Users() {
  return (
    <div>
      <Topbar title="Gestão de usuários" action="+ Adicionar usuário" />
      <div className="p-5">
        <div className="grid grid-cols-[1.2fr_1fr_1.2fr_1fr_1fr_1fr] bg-white text-sm">
          {['Nome', 'Grupo', 'E-mail', 'Leads', 'Contatos', 'Status'].map((col) => <div key={col} className="border-b border-r border-slate-100 p-3 text-xs font-bold uppercase text-slate-400">{col}</div>)}
          {['Nicolas Rosa', 'Seção de vendas', 'nicolasrosaab@gmail.com', 'Administrador', 'Administrador', 'Ativo'].map((cell) => <div key={cell} className="border-b border-r border-slate-100 p-3">{cell}</div>)}
        </div>
      </div>
    </div>
  )
}

function AISettings() {
  return (
    <div>
      <SettingsHeader title="Agenda IA" />
      <div className="space-y-5 p-6">
        {['Agenda Copilot', 'Resposta sugerida por IA', 'Sugestões de tarefas da IA'].map((item, index) => (
          <div key={item} className="bg-white p-5">
            <h3 className="text-lg">{item} <span className="rounded bg-violet-100 px-2 py-1 text-xs text-violet-700">Beta</span> <span className="ml-4 text-blue-600">—</span></h3>
            <p className="mt-2 text-sm text-slate-500">{index === 0 ? 'Assistente de IA integrado ao ambiente de trabalho.' : 'Ajuda sua equipe a responder e identificar tarefas automaticamente.'}</p>
          </div>
        ))}
      </div>
    </div>
  )
}

function Knowledge({ openKnowledge }: { openKnowledge: () => void }) {
  return (
    <div>
      <SettingsHeader title="Fontes de conhecimento da IA" />
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-500">Adicione, edite e exclua suas fontes de conhecimento de IA.</p>
        <div className="bg-white">
          <div className="grid grid-cols-6 border-b border-slate-100 p-3 text-xs font-bold uppercase text-slate-400">
            {['Nome da fonte', 'Tipo', 'Subseções', 'Vezes usado', 'Idioma', 'Usada em'].map((col) => <span key={col}>{col}</span>)}
          </div>
          <button className="w-full p-4 text-left text-sm" onClick={openKnowledge}><Plus className="mr-2 inline" size={15} />Adicionar uma nova fonte</button>
        </div>
      </div>
    </div>
  )
}

function IntegrationCenter() {
  return (
    <div>
      <SettingsHeader title="Central de integrações" />
      <div className="p-6">
        <h3 className="mb-3 font-semibold">Mensageiros</h3>
        <div className="grid gap-3 sm:grid-cols-2 md:grid-cols-4 xl:grid-cols-6">
          {integrations.map((name) => (
            <div key={name} className="rounded border border-slate-200 bg-white p-3">
              <div className="grid h-12 place-items-center rounded bg-slate-900 text-xs font-bold text-white">{name.slice(0, 12)}</div>
              <p className="mt-2 truncate text-sm font-medium">{name}</p>
              <button className="mt-2 rounded border border-slate-200 px-2 py-1 text-xs">+ Instalar</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function GenericSettings({ title }: { title: string }) {
  return <div><SettingsHeader title={title} /><div className="p-6"><div className="bg-white p-6 text-slate-500">Configurações desta seção serão conectadas ao backend.</div></div></div>
}

function WhatsAppModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded bg-white shadow-xl">
        <aside className="bg-slate-50 p-8">
          <div className="grid h-32 place-items-center rounded bg-emerald-950 text-xl font-bold text-white">WhatsApp Business</div>
          <h3 className="mt-5 text-2xl font-bold">WhatsApp Business</h3>
          <p className="mt-2 text-sm text-slate-500">Mais leads com poderosas ferramentas do WhatsApp.</p>
          <span className="mt-5 inline-block rounded border border-emerald-500 px-4 py-2 text-emerald-600">Instalado</span>
        </aside>
        <section className="relative p-10">
          <button className="absolute right-4 top-4" onClick={onClose}><X size={18} /></button>
          <div className="grid h-28 w-28 place-items-center rounded-full bg-emerald-100 text-emerald-600"><MessageCircle size={48} /></div>
          <h2 className="mt-8 text-2xl">Conecte o WhatsApp à sua conta Agenda</h2>
          <p className="mt-3 max-w-xl text-slate-500">Vincule sua conta WhatsApp existente ou crie uma nova com um número de telefone. Para vários números, repita o processo por canal.</p>
          <div className="mt-8 flex gap-3">
            <button className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white">Conectar meu WhatsApp</button>
            <button className="rounded border border-slate-200 px-5 py-2 text-sm font-semibold">Conectar número novo</button>
          </div>
          <div className="mt-8 rounded border border-slate-200 p-4 text-sm text-slate-600">
            <p className="font-semibold text-slate-800">Limites oficiais Meta</p>
            <p className="mt-1">Portfólios novos começam com 2 números registrados. O limite pode escalar até 20 números.</p>
          </div>
        </section>
      </div>
    </div>
  )
}

function KnowledgeModal({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      <div className="w-full max-w-xl rounded bg-white p-8 shadow-xl">
        <div className="mb-6 flex justify-between">
          <h2 className="text-xl">Escolha sua primeira fonte</h2>
          <button onClick={onClose}>Cancelar</button>
        </div>
        <div className="space-y-4">
          <button className="w-full rounded border border-slate-200 p-5 text-left">
            <FileText className="mr-4 inline text-blue-500" />
            <span className="font-semibold">Modelo Agenda IA</span>
            <p className="mt-2 text-sm text-slate-500">Use modelos pré-configurados para perguntas frequentes.</p>
          </button>
          <button className="w-full rounded border border-slate-200 p-5 text-left">
            <Link2 className="mr-4 inline text-slate-500" />
            <span className="font-semibold">Conteúdo personalizado</span>
            <p className="mt-2 text-sm text-slate-500">Treine a IA com seus sites, documentos e base de conhecimento.</p>
          </button>
        </div>
      </div>
    </div>
  )
}

function Copilot() {
  return (
    <aside className="hidden min-h-screen bg-white xl:flex xl:flex-col">
      <div className="flex h-16 items-center justify-between border-b border-slate-200 px-5">
        <h2 className="font-medium"><Sparkles className="mr-2 inline text-violet-500" size={16} />Agenda Copilot</h2>
        <X size={16} />
      </div>
      <button className="border-b border-slate-100 px-5 py-4 text-left text-sm">Novo chat <ChevronRight className="float-right" size={16} /></button>
      <div className="flex-1 p-5 text-center">
        <div className="mx-auto mt-16 grid h-10 w-10 place-items-center rounded bg-violet-100 text-violet-600"><Sparkles size={18} /></div>
        <h3 className="mt-5 font-semibold">Modo Ajuda</h3>
        <p className="mx-auto mt-2 max-w-xs text-sm text-slate-500">Pergunte-me qualquer coisa sobre sua base de conhecimentos. Eu encontrarei as respostas para você.</p>
      </div>
      <div className="border-t border-slate-200 p-4">
        <select className="input mb-3"><option>Modo Ajuda</option></select>
        <textarea className="input min-h-20 resize-none" placeholder="Pergunte ao Agenda Copilot" />
        <button className="mt-2 w-full rounded bg-slate-950 px-3 py-2 text-sm text-white"><Send className="mr-2 inline" size={14} />Enviar</button>
        <p className="mt-3 text-center text-xs text-slate-400">O conteúdo gerado por IA pode ser impreciso</p>
      </div>
    </aside>
  )
}

export default CrmWorkspace

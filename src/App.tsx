import {
  Activity,
  AtSign,
  BarChart3,
  Bell,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  CreditCard,
  Filter,
  FormInput,
  Inbox,
  KanbanSquare,
  Link2,
  List,
  LogOut,
  MessageCircle,
  MessagesSquare,
  MoreHorizontal,
  Plus,
  Search,
  Send,
  Settings,
  Target,
  UsersRound,
} from 'lucide-react'
import { useMemo, useState } from 'react'

type View = 'pipeline' | 'list' | 'inbox' | 'tasks' | 'team' | 'analytics' | 'forms' | 'chat-button' | 'integrations' | 'agenda'
type AppScreen = 'accounts' | 'crm'

type Lead = {
  id: string
  name: string
  company: string
  channel: 'WhatsApp' | 'Instagram' | 'Web' | 'Email'
  value: number
  stage: string
  owner: string
  status: 'Aguardando' | 'Em atendimento' | 'Sem resposta' | 'Arquivado'
  waitingMinutes: number
  lastMessage: string
  tags: string[]
}

type Conversation = {
  id: string
  customer: string
  company: string
  phone: string
  owner: string
  status: 'Novo' | 'Aberto' | 'Pendente' | 'Arquivado'
  waitingMinutes: number
  lastMessage: string
  registered: boolean
}

const stages = ['Leads de entrada', 'Decidindo', 'Discussão de contrato', 'Decisão final']

const leads: Lead[] = [
  {
    id: '1',
    name: 'Mary Chan',
    company: 'Avila Medical',
    channel: 'WhatsApp',
    value: 450,
    stage: 'Leads de entrada',
    owner: 'Nicolas',
    status: 'Aguardando',
    waitingMinutes: 42,
    lastMessage: 'Sim. Pode me ligar hoje?',
    tags: ['Urgente', 'Fácil'],
  },
  {
    id: '2',
    name: 'Ben Hurston',
    company: 'Norte Solar',
    channel: 'WhatsApp',
    value: 2500,
    stage: 'Leads de entrada',
    owner: 'Amanda',
    status: 'Sem resposta',
    waitingMinutes: 128,
    lastMessage: 'Quero entender os planos para equipe.',
    tags: ['VIP'],
  },
  {
    id: '3',
    name: 'Lisa Runner',
    company: 'RP Consultoria',
    channel: 'Web',
    value: 5000,
    stage: 'Decidindo',
    owner: 'Caio',
    status: 'Em atendimento',
    waitingMinutes: 8,
    lastMessage: 'Enviei a proposta para análise.',
    tags: ['Demo'],
  },
  {
    id: '4',
    name: 'Agnes Ruiz',
    company: 'GLI Logística',
    channel: 'Instagram',
    value: 9000,
    stage: 'Discussão de contrato',
    owner: 'Nicolas',
    status: 'Em atendimento',
    waitingMinutes: 0,
    lastMessage: 'Contrato revisado pelo financeiro.',
    tags: ['Upsell'],
  },
  {
    id: '5',
    name: 'Aaron Mayers',
    company: 'Oasis Piscinas',
    channel: 'WhatsApp',
    value: 3000,
    stage: 'Decisão final',
    owner: 'Amanda',
    status: 'Aguardando',
    waitingMinutes: 21,
    lastMessage: 'Pode emitir a cobrança.',
    tags: ['Fechamento'],
  },
]

const conversations: Conversation[] = [
  {
    id: 'c1',
    customer: 'Mary Kim',
    company: 'Avila Medical',
    phone: '+55 17 99660-0344',
    owner: 'Nicolas',
    status: 'Novo',
    waitingMinutes: 42,
    lastMessage: 'Sim. Pode me ligar?',
    registered: true,
  },
  {
    id: 'c2',
    customer: 'John Harrison',
    company: 'Lead sem cadastro',
    phone: '+55 16 99220-4331',
    owner: 'Sem responsável',
    status: 'Aberto',
    waitingMinutes: 13,
    lastMessage: 'Oi, tenho uma pergunta sobre automação.',
    registered: false,
  },
  {
    id: 'c3',
    customer: 'Soren Ember',
    company: 'RP Consultoria',
    phone: '+55 11 94399-1591',
    owner: 'Amanda',
    status: 'Pendente',
    waitingMinutes: 185,
    lastMessage: 'Você acha que poderia integrar com nosso CRM?',
    registered: true,
  },
]

const modules = [
  { id: 'pipeline', label: 'Funil', icon: KanbanSquare },
  { id: 'list', label: 'Lista', icon: List },
  { id: 'inbox', label: 'Inbox', icon: Inbox },
  { id: 'tasks', label: 'Tarefas', icon: CheckCircle2 },
  { id: 'team', label: 'Chat equipe', icon: MessagesSquare },
  { id: 'analytics', label: 'Analytics', icon: BarChart3 },
  { id: 'forms', label: 'Formulários', icon: FormInput },
  { id: 'chat-button', label: 'Botão chat', icon: Bot },
  { id: 'integrations', label: 'Integrações', icon: Link2 },
  { id: 'agenda', label: 'Agenda', icon: AtSign },
] satisfies { id: View; label: string; icon: typeof KanbanSquare }[]

function money(value: number) {
  return value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 0 })
}

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function ChannelBadge({ channel }: { channel: Lead['channel'] }) {
  const colors = {
    WhatsApp: 'bg-emerald-100 text-emerald-700',
    Instagram: 'bg-pink-100 text-pink-700',
    Web: 'bg-blue-100 text-blue-700',
    Email: 'bg-amber-100 text-amber-700',
  }

  return <span className={`rounded px-1.5 py-0.5 text-[11px] font-medium ${colors[channel]}`}>{channel}</span>
}

function App() {
  const [screen, setScreen] = useState<AppScreen>('accounts')
  const [view, setView] = useState<View>('pipeline')
  const [selectedConversation, setSelectedConversation] = useState(conversations[0])
  const [search, setSearch] = useState('')

  const filteredLeads = useMemo(() => {
    const term = search.toLowerCase().trim()
    if (!term) return leads
    return leads.filter((lead) => [lead.name, lead.company, lead.owner, lead.channel].join(' ').toLowerCase().includes(term))
  }, [search])

  const totalPipeline = leads.reduce((sum, lead) => sum + lead.value, 0)
  const waitingCount = conversations.filter((conversation) => conversation.status !== 'Arquivado' && conversation.waitingMinutes > 15).length

  if (screen === 'accounts') {
    return <AccountSelect onEnter={() => setScreen('crm')} />
  }

  return (
    <main className="min-h-screen bg-[#f4f1ff] text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[232px_minmax(0,1fr)]">
        <aside className="flex min-h-screen flex-col border-r border-slate-200 bg-slate-950 text-white">
          <div className="flex items-center gap-3 border-b border-white/10 px-5 py-5">
            <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-500">
              <AtSign size={20} />
            </div>
            <div>
              <h1 className="text-base font-semibold">Agenda CRM</h1>
              <p className="text-xs text-slate-400">WhatsApp para equipes</p>
            </div>
          </div>
          <nav className="space-y-1 p-3">
            {modules.map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.id}
                  className={`flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm ${
                    view === item.id ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={() => setView(item.id)}
                >
                  <Icon size={17} />
                  {item.label}
                </button>
              )
            })}
          </nav>
          <div className="mt-auto space-y-2 border-t border-white/10 p-3">
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setView('integrations')}>
              <BookOpen size={17} />
              Central de ajuda
            </button>
            <button className="flex w-full items-center gap-3 rounded-md bg-white px-3 py-2.5 text-left text-sm text-slate-950" onClick={() => setView('integrations')}>
              <Settings size={17} />
              Configurações
            </button>
            <button className="flex w-full items-center gap-3 rounded-md px-3 py-2.5 text-left text-sm text-slate-300 hover:bg-white/10 hover:text-white" onClick={() => setScreen('accounts')}>
              <LogOut size={17} />
              Trocar conta
            </button>
            <div className="flex items-center gap-3 px-3 pt-3">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-yellow-300 text-xs font-bold text-slate-950">NR</div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold">Nicolas Rosa</p>
                <p className="truncate text-xs text-slate-400">nicolasrosadb</p>
              </div>
            </div>
          </div>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <h2 className="text-xl font-semibold">{modules.find((item) => item.id === view)?.label}</h2>
                <p className="text-sm text-slate-500">Controle funil, inbox, equipe e WhatsApp em uma operação compartilhada.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <div className="relative w-full sm:w-80">
                  <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
                  <input
                    className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-blue-500"
                    placeholder="Buscar e filtrar"
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                  />
                </div>
                <button className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-medium">
                  <Filter className="mr-2 inline" size={16} />
                  Filtro
                </button>
                <button className="rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">
                  <Plus className="mr-2 inline" size={16} />
                  Novo lead
                </button>
              </div>
            </div>
          </header>

          <div className="p-5">
            <div className="mb-5 grid gap-3 md:grid-cols-4">
              <Metric title="Leads ativos" value={`${leads.length}`} icon={Target} tone="blue" />
              <Metric title="Pipeline" value={money(totalPipeline)} icon={Activity} tone="emerald" />
              <Metric title="Clientes esperando" value={`${waitingCount}`} icon={Clock3} tone="amber" />
              <Metric title="Números conectados" value="3" icon={MessageCircle} tone="violet" />
            </div>

            {view === 'pipeline' && <Pipeline leads={filteredLeads} />}
            {view === 'list' && <LeadList leads={filteredLeads} />}
            {view === 'inbox' && (
              <InboxView
                conversations={conversations}
                selectedConversation={selectedConversation}
                setSelectedConversation={setSelectedConversation}
              />
            )}
            {view === 'tasks' && <FeatureGrid kind="tasks" />}
            {view === 'team' && <FeatureGrid kind="team" />}
            {view === 'analytics' && <Analytics />}
            {view === 'forms' && <Builder title="Formulário web" icon={FormInput} />}
            {view === 'chat-button' && <Builder title="Botão de chat multi-mensageiros" icon={Bot} />}
            {view === 'integrations' && <SettingsBilling />}
            {view === 'agenda' && <AgendaModule />}
          </div>
        </section>
      </div>
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
            <button className="hover:text-blue-600">Criar outra conta</button>
            <button className="hover:text-blue-600">Acesse o portal do parceiro</button>
            <button className="hover:text-blue-600">Sair</button>
          </div>
        </div>
        <h2 className="mt-9 text-center text-2xl font-bold">Selecione uma conta</h2>
        <button className="mt-7 flex w-full items-center justify-between rounded-md px-2 py-4 text-left hover:bg-slate-50" onClick={onEnter}>
          <span className="flex items-center gap-4">
            <span className="rounded-md bg-yellow-200 px-8 py-2 text-xs font-semibold">Teste</span>
            <span className="font-bold">nicolasrosadb</span>
          </span>
          <span className="text-3xl">›</span>
        </button>
      </section>
    </main>
  )
}

function Metric({ title, value, icon: Icon, tone }: { title: string; value: string; icon: typeof Activity; tone: string }) {
  const tones: Record<string, string> = {
    blue: 'bg-blue-50 text-blue-700',
    emerald: 'bg-emerald-50 text-emerald-700',
    amber: 'bg-amber-50 text-amber-700',
    violet: 'bg-violet-50 text-violet-700',
  }

  return (
    <div className="rounded-md border border-slate-200 bg-white p-4">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{title}</span>
        <span className={`grid h-8 w-8 place-items-center rounded-md ${tones[tone]}`}>
          <Icon size={17} />
        </span>
      </div>
      <div className="mt-3 text-2xl font-semibold">{value}</div>
    </div>
  )
}

function Pipeline({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-x-auto rounded-md border border-slate-200 bg-white p-4">
      <div className="grid min-w-[1040px] grid-cols-4 gap-4">
        {stages.map((stage, index) => (
          <div key={stage} className="min-h-[520px]">
            <div className="mb-3 border-b-4 pb-2 text-center text-sm font-bold uppercase tracking-[0.16em]" style={{ borderColor: ['#facc15', '#a855f7', '#7dd957', '#3b82f6'][index] }}>
              {stage}
            </div>
            <div className="space-y-3">
              {leads.filter((lead) => lead.stage === stage).map((lead) => (
                <LeadCard key={lead.id} lead={lead} />
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function LeadCard({ lead }: { lead: Lead }) {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold">{initials(lead.name)}</div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{lead.name}</p>
            <span className="text-xs text-slate-400">{lead.waitingMinutes ? `${lead.waitingMinutes}m` : 'agora'}</span>
          </div>
          <p className="truncate text-sm font-medium text-blue-700">{lead.company}</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <ChannelBadge channel={lead.channel} />
            {lead.tags.map((tag) => (
              <span key={tag} className="rounded border border-slate-200 px-1.5 py-0.5 text-[11px] text-slate-500">{tag}</span>
            ))}
          </div>
          <div className="mt-2 flex items-center justify-between text-xs text-slate-500">
            <span>{money(lead.value)}</span>
            <span>{lead.status}</span>
          </div>
        </div>
      </div>
    </div>
  )
}

function LeadList({ leads }: { leads: Lead[] }) {
  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
      {leads.map((lead) => (
        <div key={lead.id} className="grid gap-3 border-b border-slate-100 p-4 text-sm md:grid-cols-[1.4fr_1fr_120px_140px_120px] md:items-center">
          <div className="min-w-0">
            <p className="truncate font-semibold">{lead.name}</p>
            <p className="truncate text-slate-500">{lead.company}</p>
          </div>
          <p className="truncate text-slate-600">{lead.lastMessage}</p>
          <ChannelBadge channel={lead.channel} />
          <span className="text-slate-600">{lead.owner}</span>
          <span className="font-semibold">{money(lead.value)}</span>
        </div>
      ))}
    </div>
  )
}

function InboxView({
  conversations,
  selectedConversation,
  setSelectedConversation,
}: {
  conversations: Conversation[]
  selectedConversation: Conversation
  setSelectedConversation: (conversation: Conversation) => void
}) {
  return (
    <div className="grid min-h-[620px] overflow-hidden rounded-md border border-slate-200 bg-white xl:grid-cols-[340px_minmax(0,1fr)_300px]">
      <div className="border-r border-slate-200">
        <div className="border-b border-slate-200 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">Caixa de entrada</h3>
            <span className="rounded-full bg-blue-100 px-2 py-0.5 text-xs font-semibold text-blue-700">180</span>
          </div>
        </div>
        {conversations.map((conversation) => (
          <button
            key={conversation.id}
            className={`flex w-full gap-3 border-b border-slate-100 p-4 text-left hover:bg-slate-50 ${
              selectedConversation.id === conversation.id ? 'bg-blue-50' : ''
            }`}
            onClick={() => setSelectedConversation(conversation)}
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-semibold">{initials(conversation.customer)}</div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-sm font-semibold">{conversation.customer}</p>
                <span className="text-xs text-slate-400">{conversation.waitingMinutes}m</span>
              </div>
              <p className="truncate text-sm text-slate-500">{conversation.lastMessage}</p>
            </div>
          </button>
        ))}
      </div>

      <div className="flex min-w-0 flex-col">
        <div className="flex items-center justify-between border-b border-slate-200 p-4">
          <div>
            <h3 className="font-semibold">{selectedConversation.customer}</h3>
            <p className="text-sm text-slate-500">{selectedConversation.phone}</p>
          </div>
          <button className="rounded-md border border-slate-200 px-3 py-2 text-sm">
            <MoreHorizontal size={16} />
          </button>
        </div>
        <div className="flex-1 space-y-4 bg-slate-50 p-5">
          <Bubble side="left" text={selectedConversation.lastMessage} />
          <Bubble side="right" text="Olá! Já estou verificando para te responder com precisão." />
          <Bubble side="left" text="Perfeito, fico no aguardo." />
        </div>
        <div className="border-t border-slate-200 p-4">
          <div className="rounded-md border border-slate-200 bg-white p-3">
            <textarea className="min-h-20 w-full resize-none outline-none" placeholder="Responder no WhatsApp..." />
            <div className="mt-2 flex items-center justify-between">
              <button className="text-sm text-blue-700">/modelos</button>
              <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
                <Send className="mr-2 inline" size={15} />
                Enviar
              </button>
            </div>
          </div>
        </div>
      </div>

      <div className="border-l border-slate-200 p-4">
        <h3 className="font-semibold">Contexto do cliente</h3>
        <div className="mt-4 space-y-3 text-sm">
          <Info label="Cadastro" value={selectedConversation.registered ? 'Cliente cadastrado' : 'Lead sem cadastro'} />
          <Info label="Responsável" value={selectedConversation.owner} />
          <Info label="Status" value={selectedConversation.status} />
          <Info label="Tempo sem resposta" value={`${selectedConversation.waitingMinutes} minutos`} />
        </div>
        <button className="mt-5 w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Criar tarefa</button>
        <button className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium">Arquivar conversa</button>
      </div>
    </div>
  )
}

function Bubble({ side, text }: { side: 'left' | 'right'; text: string }) {
  return (
    <div className={`flex ${side === 'right' ? 'justify-end' : 'justify-start'}`}>
      <div className={`max-w-[70%] rounded-md px-4 py-3 text-sm shadow-sm ${side === 'right' ? 'bg-blue-600 text-white' : 'bg-white'}`}>{text}</div>
    </div>
  )
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-slate-200 p-3">
      <p className="text-xs uppercase text-slate-400">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  )
}

function FeatureGrid({ kind }: { kind: 'tasks' | 'team' }) {
  const items = kind === 'tasks'
    ? [
        ['Lembretes por cliente', 'Crie follow-ups em perfis de clientes e acompanhe atrasos.'],
        ['Agenda da equipe', 'Veja tarefas por responsável, prioridade e vencimento.'],
        ['Automação no funil', 'Ao mover etapa, dispare tarefas, mensagens ou tags.'],
      ]
    : [
        ['Chat privado', 'Converse com colegas sem sair do atendimento.'],
        ['Grupos por equipe', 'Crie salas para vendas, suporte e financeiro.'],
        ['Menções em clientes', 'Chame um colega dentro do perfil do cliente.'],
      ]
  return (
    <div className="grid gap-4 md:grid-cols-3">
      {items.map(([title, body]) => (
        <div key={title} className="rounded-md border border-slate-200 bg-white p-5">
          <Bell className="mb-4 text-blue-600" />
          <h3 className="font-semibold">{title}</h3>
          <p className="mt-2 text-sm text-slate-500">{body}</p>
        </div>
      ))}
    </div>
  )
}

function Analytics() {
  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_320px]">
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <h3 className="font-semibold">Performance em tempo real</h3>
        <div className="mt-6 flex h-72 items-end gap-3">
          {[44, 62, 38, 76, 58, 92, 67, 84].map((height, index) => (
            <div key={height + index} className="flex flex-1 flex-col items-center gap-2">
              <div className="w-full rounded-t bg-blue-500" style={{ height: `${height}%` }} />
              <span className="text-xs text-slate-400">{index + 1}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="space-y-3">
        <Info label="Tempo médio primeira resposta" value="7m 42s" />
        <Info label="Conversas resolvidas hoje" value="68" />
        <Info label="SLA violado" value="5 conversas" />
      </div>
    </div>
  )
}

function Builder({ title, icon: Icon }: { title: string; icon: typeof FormInput }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[360px_minmax(0,1fr)]">
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <Icon className="mb-4 text-blue-600" />
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="mt-2 text-sm text-slate-500">Configure campos, origem, tags automáticas e destino no funil de vendas.</p>
        <div className="mt-5 space-y-3">
          <input className="input" placeholder="Nome da campanha" />
          <input className="input" placeholder="Etapa destino do funil" />
          <button className="w-full rounded-md bg-blue-600 px-3 py-2 text-sm font-medium text-white">Salvar configuração</button>
        </div>
      </div>
      <div className="rounded-md border border-slate-200 bg-white p-5">
        <div className="rounded-md border-2 border-dashed border-slate-200 p-8">
          <p className="text-sm font-semibold">Prévia</p>
          <div className="mt-4 rounded-md bg-slate-50 p-5">
            <input className="input mb-3" placeholder="Nome" />
            <input className="input mb-3" placeholder="WhatsApp" />
            <button className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white">Conversar agora</button>
          </div>
        </div>
      </div>
    </div>
  )
}

function SettingsBilling() {
  const sections = [
    ['Perfil', 'Configurações de perfil'],
    ['Área de trabalho', 'Configurações de trabalho', 'Configurações de chat', 'Configurações de email', 'Faturamento', 'Gestão de usuários'],
    ['IA', 'Configurações de IA', 'Fontes de conhecimento'],
    ['Integrações e canais', 'Central de integrações'],
  ]

  return (
    <div className="grid min-h-[720px] overflow-hidden rounded-md border border-slate-200 bg-white lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 p-4">
        <h3 className="mb-5 text-sm font-bold uppercase">Configurações</h3>
        <div className="space-y-5">
          {sections.map(([title, ...items]) => (
            <div key={title}>
              <p className="mb-2 text-xs font-semibold text-slate-400">{title}</p>
              <div className="space-y-1">
                {items.map((item) => (
                  <button key={item} className={`w-full truncate rounded-md px-3 py-2 text-left text-sm ${item === 'Faturamento' ? 'bg-blue-100 font-semibold text-blue-700' : 'hover:bg-slate-50'}`}>
                    {item}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </aside>
      <section className="bg-slate-50">
        <div className="border-b border-slate-200 bg-white px-8 py-5">
          <h2 className="font-bold uppercase">Faturamento</h2>
        </div>
        <div className="mx-auto max-w-3xl p-8">
          <div className="mb-6 flex gap-8 border-b border-slate-200 text-sm">
            <button className="border-b-2 border-blue-600 px-2 pb-2 text-slate-700">Meu plano</button>
            <button className="px-2 pb-2 text-slate-500">Complementos</button>
            <button className="px-2 pb-2 text-slate-500">Uso</button>
          </div>
          <div className="rounded-md border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-semibold">Teste Pro</h3>
              <span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">11 dias restantes</span>
            </div>
            <p className="mt-2 text-sm text-slate-500">Explore o que está incluído no Pro durante seu período de teste.</p>
            <ul className="mt-5 space-y-3 text-sm text-slate-700">
              {['Transmissão', 'Automação avançada', 'Conexões ilimitadas no WhatsApp e Instagram', 'Agendamentos com agentes de IA', 'Reconhecimento de mensagens de voz com IA', 'Até 50 agentes de IA'].map((item) => (
                <li key={item} className="flex items-center gap-3">
                  <CheckCircle2 className="text-emerald-600" size={16} />
                  {item}
                </li>
              ))}
            </ul>
            <div className="mt-6 flex flex-wrap gap-2">
              <button className="rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white">
                <CreditCard className="mr-2 inline" size={16} />
                Assinar o Pro
              </button>
              <button className="rounded-md border border-slate-200 px-4 py-2 text-sm font-semibold">Explorar planos</button>
            </div>
          </div>
          <div className="mt-5 grid gap-3 md:grid-cols-3">
            <Info label="Usuários ativos" value="12 de 20" />
            <Info label="Números conectados" value="3" />
            <Info label="Mensagens no mês" value="18.420" />
          </div>
        </div>
      </section>
    </div>
  )
}

function AgendaModule() {
  return (
    <div className="rounded-md border border-slate-200 bg-white p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-semibold">Agenda de contatos</h3>
          <p className="text-sm text-slate-500">Agora a agenda é um módulo auxiliar do CRM, ligado a leads, conversas e empresas.</p>
        </div>
        <button className="rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white">
          <UsersRound className="mr-2 inline" size={16} />
          Importar contatos
        </button>
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-3">
        <Info label="Contatos vinculados" value="4.309" />
        <Info label="Sem cadastro completo" value="1.577" />
        <Info label="Duplicados bloqueados" value="1.379" />
      </div>
    </div>
  )
}

export default App

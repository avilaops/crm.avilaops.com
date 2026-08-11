import { Check, CheckCircle2, MessageCircle, Music2, Plus } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import LeadSourceModal, { InstagramIcon, type LeadSource } from '../../components/modals/LeadSourceModal'
import { integrations, settingsItems } from '../../data/crm'
import { disconnectMeta, getMetaStatus, saveMetaCredentials, type MetaStatus } from '../../lib/meta'
import type { Page } from '../../types'
import { Topbar } from '../workspace/WorkspacePages'

function SettingsShell({ page, setPage, openKnowledge }: { page: Page; setPage: (page: Page) => void; openKnowledge: () => void }) {
  return (
    <div className="grid min-h-screen grid-cols-[250px_minmax(0,1fr)]">
      <aside className="border-r border-slate-200 bg-white">
        <h2 className="border-b border-slate-200 p-5 text-sm font-bold uppercase">Configurações</h2>
        <div className="p-4 text-sm">
          {['Perfil', 'Área de trabalho', 'Funil de vendas', 'IA', 'Integrações e canais'].map((group) => (
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
        {page === 'lead-sources' && <LeadSources />}
        {!['profile-settings', 'billing', 'users', 'ai-settings', 'knowledge', 'integrations', 'lead-sources'].includes(page) && <GenericSettings title={settingsItems.find(([, id]) => id === page)?.[2] || 'Configurações'} />}
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

function LeadSources() {
  const [status, setStatus] = useState<MetaStatus | null>(null)
  const [loadingStatus, setLoadingStatus] = useState(true)
  const [openSource, setOpenSource] = useState<LeadSource | null>(null)
  const [showCredentials, setShowCredentials] = useState(false)
  const [appId, setAppId] = useState('')
  const [appSecret, setAppSecret] = useState('')
  const [setupToken, setSetupToken] = useState(() => sessionStorage.getItem('agenda-meta-setup-token') ?? '')
  const [savingCredentials, setSavingCredentials] = useState(false)
  const [credentialsError, setCredentialsError] = useState('')
  const [disconnecting, setDisconnecting] = useState(false)

  useEffect(() => {
    getMetaStatus()
      .then((result) => {
        setStatus(result)
      })
      .catch(() => setStatus(null))
      .finally(() => setLoadingStatus(false))
  }, [])

  async function handleSaveCredentials(event: FormEvent) {
    event.preventDefault()
    setSavingCredentials(true)
    setCredentialsError('')
    try {
      sessionStorage.setItem('agenda-meta-setup-token', setupToken)
      const result = await saveMetaCredentials(appId, appSecret, setupToken)
      setStatus(result)
      setAppSecret('')
      setShowCredentials(false)
    } catch (err) {
      setCredentialsError(typeof err === 'string' ? err : 'Não foi possível salvar as credenciais.')
    } finally {
      setSavingCredentials(false)
    }
  }

  async function handleDisconnect() {
    setDisconnecting(true)
    try {
      sessionStorage.setItem('agenda-meta-setup-token', setupToken)
      setStatus(await disconnectMeta(setupToken))
    } finally {
      setDisconnecting(false)
    }
  }

  const sources = [
    { id: 'whatsapp' as const, label: 'WhatsApp', iconBg: 'bg-emerald-500', icon: MessageCircle, ready: true },
    { id: 'instagram' as const, label: 'Instagram', iconBg: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600', icon: InstagramIcon, ready: true },
    { id: 'tiktok' as const, label: 'TikTok', iconBg: 'bg-slate-900', icon: Music2, ready: false },
  ]

  return (
    <div>
      <SettingsHeader title="Fontes de lead" />
      <div className="p-6">
        <p className="mb-4 text-sm text-slate-500">
          Conecte canais para capturar leads automaticamente no seu funil de vendas. WhatsApp e Instagram usam o mesmo login da Meta.
        </p>

        <div className="mb-6 rounded border border-slate-200 bg-white p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold">Aplicativo da Meta</p>
              <p className="mt-1 text-sm text-slate-500">
                {loadingStatus
                  ? 'Verificando configuração...'
                  : status?.connected
                    ? `Conectado como ${status.userName ?? 'conta Meta'}`
                      : status?.configured
                      ? `App configurado (${status.appConfiguredHint ?? 'identificador oculto'}). Ainda não conectado.`
                      : 'Configure o App ID e o App Secret do app já publicado na Meta para liberar as fontes abaixo.'}
              </p>
            </div>
            <div className="flex gap-2">
              {status?.connected && (
                <button
                  className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold disabled:opacity-60"
                  onClick={handleDisconnect}
                  disabled={disconnecting}
                >
                  {disconnecting ? 'Desconectando...' : 'Desconectar'}
                </button>
              )}
              <button className="rounded border border-slate-200 px-3 py-2 text-xs font-semibold" onClick={() => setShowCredentials((value) => !value)}>
                {status?.configured ? 'Editar credenciais' : 'Configurar credenciais'}
              </button>
            </div>
          </div>

          {showCredentials && (
            <form className="mt-4 grid gap-3 border-t border-slate-100 pt-4 sm:grid-cols-2" onSubmit={handleSaveCredentials}>
              <label className="grid gap-1 text-sm sm:col-span-2">
                <span className="text-slate-600">Token administrativo</span>
                <input
                  className="input"
                  type="password"
                  value={setupToken}
                  onChange={(event) => setSetupToken(event.target.value)}
                  placeholder="token de configuração do Worker"
                  required
                />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-600">App ID</span>
                <input className="input" value={appId} onChange={(event) => setAppId(event.target.value)} placeholder="000000000000000" required />
              </label>
              <label className="grid gap-1 text-sm">
                <span className="text-slate-600">App Secret</span>
                <input
                  className="input"
                  type="password"
                  value={appSecret}
                  onChange={(event) => setAppSecret(event.target.value)}
                  placeholder={status?.configured ? 'deixe em branco para manter o atual' : 'obrigatório na primeira configuração'}
                />
              </label>
              {credentialsError && <p className="text-sm text-red-600 sm:col-span-2">{credentialsError}</p>}
              <div className="flex gap-2 sm:col-span-2">
                <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" type="submit" disabled={savingCredentials}>
                  {savingCredentials ? 'Salvando...' : 'Salvar credenciais'}
                </button>
                <a
                  className="rounded border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
                  href="https://developers.facebook.com/apps"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir developers.facebook.com
                </a>
              </div>
            </form>
          )}
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {sources.map((source) => {
            const Icon = source.icon
            const connected = source.ready && status?.connected
            return (
              <div key={source.id} className="rounded border border-slate-200 bg-white p-5 text-center">
                <div className={`mx-auto grid h-14 w-14 place-items-center rounded-2xl text-white ${source.iconBg}`}>
                  <Icon size={26} />
                </div>
                <p className="mt-3 font-semibold">{source.label}</p>
                {connected ? (
                  <span className="mt-4 inline-block rounded border border-emerald-500 px-3 py-2 text-xs font-semibold text-emerald-600">Conectado</span>
                ) : (
                  <button
                    className={`mt-4 rounded px-3 py-2 text-xs font-semibold ${source.ready ? 'bg-blue-600 text-white' : 'cursor-not-allowed bg-slate-100 text-slate-400'}`}
                    disabled={!source.ready}
                    onClick={() => source.ready && setOpenSource(source.id as LeadSource)}
                  >
                    {source.ready ? '+ Adicionar fonte' : 'Em breve'}
                  </button>
                )}
              </div>
            )
          })}
        </div>
      </div>

      {openSource && (
        <LeadSourceModal source={openSource} onClose={() => setOpenSource(null)} onConnected={(result) => setStatus(result)} />
      )}
    </div>
  )
}

function GenericSettings({ title }: { title: string }) {
  return <div><SettingsHeader title={title} /><div className="p-6"><div className="bg-white p-6 text-slate-500">Configurações desta seção serão conectadas ao backend.</div></div></div>
}


export default SettingsShell


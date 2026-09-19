import {
  Check,
  CheckCircle2,
  FileText,
  HelpCircle,
  MessageCircle,
  Music2,
  Plus,
  Shield,
  Sparkles,
  Trash2,
  X,
} from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import LeadSourceModal, { InstagramIcon, type LeadSource } from '../../components/modals/LeadSourceModal'
import KnowledgeModal from '../../components/modals/KnowledgeModal'
import { settingsItems } from '../../data/crm'
import {
  createUser,
  deleteKnowledgeSource,
  getTenantSettings,
  listChannels,
  listKnowledgeSources,
  listUsers,
  syncMetaChannels,
  updateKnowledgeSource,
  updateTenantSettings,
  updateUser,
  type CrmChannel,
  type CrmUser,
  type KnowledgeSource,
} from '../../lib/crm'
import { disconnectMeta, getMetaStatus, saveMetaCredentials, type MetaStatus } from '../../lib/meta'
import { getGoogleAuthUrl } from '../../lib/googleCalendar'
import MailSettings from './MailSettings'
import IntegrationCenterPage from './IntegrationCenterPage'
import type { Page } from '../../types'
import Topbar from '../../components/layout/Topbar'

function SettingsShell({ page, setPage, openKnowledge: _openKnowledge }: { page: Page; setPage: (page: Page) => void; openKnowledge?: () => void }) {
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
        {page === 'workspace-settings' && <WorkspaceSettings />}
        {page === 'chat-settings' && <ChatSettings />}
        {page === 'mail-settings' && <MailSettings />}
        {page === 'billing' && <Billing />}
        {page === 'users' && <Users />}
        {page === 'ai-settings' && <AISettings />}
        {page === 'knowledge' && <Knowledge />}
        {page === 'integrations' && <IntegrationCenterPage />}
        {page === 'lead-sources' && <LeadSources />}
        {page === 'channels' && <Channels />}
        {!['profile-settings', 'workspace-settings', 'chat-settings', 'billing', 'users', 'ai-settings', 'knowledge', 'integrations', 'lead-sources', 'channels'].includes(page) && <GenericSettings title={settingsItems.find(([, id]) => id === page)?.[2] || 'Configurações'} />}
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
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly')
  const [selectedPlan, setSelectedPlan] = useState<{ name: string; price: number } | null>(null)
  const [selectedGateway, setSelectedGateway] = useState<'mercadopago' | 'efi' | 'paypal'>('mercadopago')
  const [processing, setProcessing] = useState(false)
  const [checkoutSuccess, setCheckoutSuccess] = useState(false)

  const plans = [
    {
      id: 'start',
      name: 'Start',
      badge: 'Entrada',
      description: 'Ideal para profissionais autônomos e pequenos negócios iniciando no WhatsApp.',
      monthlyPrice: 97,
      yearlyPrice: 79,
      isFeatured: false,
      features: [
        '1 número de WhatsApp oficial',
        '2 usuários / atendentes',
        'Até 1.000 contatos e leads',
        'Inbox com SLA e atribuição',
        'Funil de vendas Kanban',
        'Até 500 e-mails de newsletter/mês',
      ],
      limitations: [
        'Sem automações n8n',
        'Sem agente de IA generativa',
      ],
    },
    {
      id: 'pro',
      name: 'Pro / Escala',
      badge: 'Mais Escolhido',
      description: 'O sistema operacional completo para empresas que querem escalar vendas e atendimento.',
      monthlyPrice: 247,
      yearlyPrice: 197,
      isFeatured: true,
      features: [
        '3 números de WhatsApp oficial + Instagram',
        '10 usuários / atendentes',
        'Contatos, empresas e leads ILIMITADOS',
        'Automações comerciais & Webhooks n8n',
        'Agente de IA comercial com Base de Conhecimento RAG',
        'Campanhas de newsletter ilimitadas',
        'Integração com ERP e Google Agenda',
        'Suporte prioritário via WhatsApp',
      ],
      limitations: [],
    },
    {
      id: 'enterprise',
      name: 'Enterprise',
      badge: 'Operação Total',
      description: 'Estrutura robusta com múltiplos funis, consultoria e performance dedicada.',
      monthlyPrice: 697,
      yearlyPrice: 547,
      isFeatured: false,
      features: [
        'Números de WhatsApp e atendentes ILIMITADOS',
        'Múltiplos funis de vendas customizados',
        'Instância e IP dedicados de alta performance',
        'Consultoria de fluxos n8n pela equipe Ávila Ops',
        'SLA de atendimento em até 15 minutos',
        'Trilha completa de auditoria e segurança avançada',
      ],
      limitations: [],
    },
  ]

  const handleSubscribe = (plan: { name: string; price: number }) => {
    setSelectedPlan(plan)
    setCheckoutSuccess(false)
  }

  const handleConfirmCheckout = () => {
    setProcessing(true)
    setTimeout(() => {
      setProcessing(false)
      setCheckoutSuccess(true)
    }, 1200)
  }

  return (
    <div>
      <SettingsHeader title="Faturamento & Planos" />
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex justify-center gap-8 border-b border-slate-200">
          {[
            ['plan', 'Planos de Assinatura'],
            ['addons', 'Complementos'],
            ['usage', 'Consumo & Limites'],
          ].map(([id, label]) => (
            <button
              key={id}
              className={`px-3 pb-3 text-sm font-semibold transition ${
                tab === id ? 'border-b-2 border-blue-600 text-blue-600' : 'text-slate-500 hover:text-slate-800'
              }`}
              onClick={() => setTab(id as typeof tab)}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'plan' && (
          <div className="space-y-6">
            <div className="flex flex-col items-center justify-between gap-4 rounded-lg bg-white p-5 shadow-sm sm:flex-row">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Plano Atual: <span className="text-blue-600">Período de Demonstração Pro</span>
                </h3>
                <p className="text-xs text-slate-500">Acesso ilimitado às funcionalidades de vendas, automações e IA.</p>
              </div>
              <div className="flex items-center gap-2 rounded-full bg-slate-100 p-1 text-xs font-semibold">
                <button
                  className={`rounded-full px-3 py-1 transition ${
                    billingCycle === 'monthly' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'
                  }`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  Mensal
                </button>
                <button
                  className={`rounded-full px-3 py-1 transition ${
                    billingCycle === 'yearly' ? 'bg-blue-600 text-white shadow-sm' : 'text-slate-500'
                  }`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  Anual <span className="ml-1 text-[10px] text-emerald-300 font-bold">-20%</span>
                </button>
              </div>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
              {plans.map((plan) => {
                const price = billingCycle === 'yearly' ? plan.yearlyPrice : plan.monthlyPrice
                return (
                  <div
                    key={plan.id}
                    className={`relative flex flex-col justify-between rounded-xl bg-white p-6 shadow-sm transition ${
                      plan.isFeatured
                        ? 'border-2 border-blue-600 ring-4 ring-blue-50'
                        : 'border border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    {plan.isFeatured && (
                      <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-white shadow">
                        {plan.badge}
                      </span>
                    )}
                    <div>
                      <div className="flex items-center justify-between">
                        <h4 className="text-lg font-bold text-slate-900">{plan.name}</h4>
                        {!plan.isFeatured && (
                          <span className="rounded bg-slate-100 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            {plan.badge}
                          </span>
                        )}
                      </div>
                      <p className="mt-2 min-h-[36px] text-xs text-slate-500">{plan.description}</p>
                      <div className="my-5 border-y border-slate-100 py-3">
                        <span className="text-3xl font-extrabold text-slate-900">R$ {price}</span>
                        <span className="text-xs text-slate-400">/mês {billingCycle === 'yearly' ? '(cobrado anualmente)' : ''}</span>
                      </div>
                      <div className="space-y-2.5 text-xs">
                        <p className="font-semibold uppercase tracking-wider text-slate-400">Recursos Inclusos:</p>
                        {plan.features.map((feat) => (
                          <div key={feat} className="flex items-start gap-2 text-slate-700">
                            <CheckCircle2 size={15} className="shrink-0 text-emerald-600 mt-0.5" />
                            <span>{feat}</span>
                          </div>
                        ))}
                        {plan.limitations.map((lim) => (
                          <div key={lim} className="flex items-start gap-2 text-slate-400 line-through">
                            <span className="h-3.5 w-3.5 shrink-0 rounded-full border border-slate-300 text-center text-[9px] leading-3 text-slate-400 mt-0.5">✕</span>
                            <span>{lim}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <button
                      className={`mt-6 w-full rounded-lg py-2.5 text-xs font-bold uppercase tracking-wider transition ${
                        plan.isFeatured
                          ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                          : 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50'
                      }`}
                      onClick={() => handleSubscribe({ name: plan.name, price })}
                    >
                      Assinar {plan.name}
                    </button>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {tab === 'addons' && <AddonsTab />}
        {tab === 'usage' && <UsageTab />}
      </div>

      {selectedPlan && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-base font-bold text-slate-900">Checkout Seguro — Ávila Ops</h3>
                <p className="text-xs text-slate-500">Ativação instantânea no seu workspace.</p>
              </div>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setSelectedPlan(null)}>
                <X size={18} />
              </button>
            </div>

            {checkoutSuccess ? (
              <div className="py-8 text-center">
                <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
                  <CheckCircle2 size={28} />
                </div>
                <h4 className="mt-4 text-base font-bold text-slate-900">Assinatura Ativada com Sucesso!</h4>
                <p className="mt-2 text-xs text-slate-500">
                  Seu workspace foi atualizado para o plano <strong className="text-slate-800">{selectedPlan.name}</strong> via{' '}
                  <strong className="capitalize text-slate-800">{selectedGateway}</strong>.
                </p>
                <button
                  className="mt-6 rounded-lg bg-blue-600 px-6 py-2 text-xs font-bold uppercase tracking-wider text-white"
                  onClick={() => setSelectedPlan(null)}
                >
                  Concluir & Voltar ao CRM
                </button>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <div className="rounded-lg bg-slate-50 p-3 text-xs text-slate-700">
                  <div className="flex justify-between font-semibold">
                    <span>Plano Selecionado:</span>
                    <span>{selectedPlan.name} ({billingCycle === 'yearly' ? 'Anual' : 'Mensal'})</span>
                  </div>
                  <div className="mt-1 flex justify-between text-base font-extrabold text-slate-900">
                    <span>Total a pagar:</span>
                    <span className="text-blue-600">R$ {selectedPlan.price},00/mês</span>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">
                    Selecione o Gateway de Pagamento:
                  </label>
                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${
                        selectedGateway === 'mercadopago'
                          ? 'border-blue-600 bg-blue-50/50 text-blue-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                      onClick={() => setSelectedGateway('mercadopago')}
                    >
                      <span className="text-xs">Mercado Pago</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Pix / Cartão 12x</span>
                    </button>
                    <button
                      type="button"
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${
                        selectedGateway === 'efi'
                          ? 'border-emerald-600 bg-emerald-50/50 text-emerald-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                      onClick={() => setSelectedGateway('efi')}
                    >
                      <span className="text-xs">Éfi Pay</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Pix Instantâneo</span>
                    </button>
                    <button
                      type="button"
                      className={`flex flex-col items-center justify-center rounded-lg border p-3 text-center transition ${
                        selectedGateway === 'paypal'
                          ? 'border-indigo-600 bg-indigo-50/50 text-indigo-700 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                      }`}
                      onClick={() => setSelectedGateway('paypal')}
                    >
                      <span className="text-xs">PayPal</span>
                      <span className="text-[10px] text-slate-400 mt-0.5">Internacional</span>
                    </button>
                  </div>
                </div>

                <div className="rounded border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-800">
                  🔒 Conexão criptografada de ponta a ponta. Garantia incondicional de 7 dias com reembolso integral.
                </div>

                <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    className="rounded border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                    onClick={() => setSelectedPlan(null)}
                  >
                    Cancelar
                  </button>
                  <button
                    type="button"
                    disabled={processing}
                    className="rounded bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
                    onClick={handleConfirmCheckout}
                  >
                    {processing ? 'Processando...' : `Pagar com ${selectedGateway === 'efi' ? 'Éfi' : selectedGateway === 'mercadopago' ? 'Mercado Pago' : 'PayPal'}`}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function AddonsTab() {
  return (
    <div className="bg-white p-6 rounded-lg shadow-sm">
      <h3 className="mb-2 text-base font-bold text-slate-900">Complementos & Capacidade Adicional</h3>
      <p className="mb-5 text-xs text-slate-500">Expanda os recursos da sua operação sob demanda.</p>
      <div className="grid gap-5 md:grid-cols-2">
        <Addon title="Pacote de Tokens IA" price="R$ 49/mês" description="100.000 tokens adicionais para atendimento com IA e Copilot." button="Contratar IA" />
        <Addon title="Número WhatsApp Adicional" price="R$ 39/mês" description="Conecte mais uma linha oficial com sincronização e SLA." button="Adicionar Linha" />
        <Addon title="Armazenamento 50GB" price="R$ 29/mês" description="Espaço extra para mídias, PDFs e gravações de áudio." button="Expandir Espaço" />
        <Addon title="Usuário / Atendente Extra" price="R$ 25/mês" description="Adicione mais um assento de operador no workspace." button="Adicionar Assento" />
      </div>
    </div>
  )
}

function Addon({ title, price, description, button }: { title: string; price: string; description: string; button: string }) {
  return (
    <div className="rounded-lg border border-slate-200 p-5 flex flex-col justify-between">
      <div>
        <div className="flex justify-between items-center">
          <h4 className="font-bold text-sm text-slate-900">{title}</h4>
          <span className="font-extrabold text-blue-600 text-xs">{price}</span>
        </div>
        <p className="mt-2 text-xs text-slate-500">{description}</p>
      </div>
      <button className="mt-4 rounded bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 self-start">
        {button}
      </button>
    </div>
  )
}

function UsageTab() {
  const rows = [
    { label: 'Leads no Funil', used: '142', limit: 'Ilimitado', pct: '15%' },
    { label: 'Contatos & Empresas', used: '864', limit: 'Ilimitado', pct: '25%' },
    { label: 'Números de WhatsApp', used: '1', limit: '3 Linhas', pct: '33%' },
    { label: 'Armazenamento de Mídia', used: '240 MB', limit: '10 GB', pct: '2.4%' },
    { label: 'Automações & Webhooks n8n', used: '6 ativas', limit: 'Ilimitado', pct: '100%' },
    { label: 'Disparos de Newsletter (Mês)', used: '1.250', limit: 'Ilimitado', pct: '40%' },
  ]
  return (
    <div className="space-y-4">
      <div className="bg-white p-5 rounded-lg shadow-sm">
        <h3 className="text-base font-bold text-slate-900">Consumo em Tempo Real</h3>
        <p className="text-xs text-slate-500 mt-1">Uso de capacidade pelo workspace no ciclo atual.</p>
      </div>
      <div className="grid gap-3">
        {rows.map((row) => (
          <div key={row.label} className="bg-white p-4 rounded-lg border border-slate-200 flex items-center justify-between">
            <div>
              <p className="font-semibold text-xs text-slate-900">{row.label}</p>
              <p className="text-xs text-slate-400 mt-0.5">Uso: <strong className="text-slate-700">{row.used}</strong> de {row.limit}</p>
            </div>
            <span className="rounded bg-blue-50 px-2.5 py-1 text-xs font-bold text-blue-700">{row.pct}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

function Users() {
  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [form, setForm] = useState({ name: '', email: '', role: 'atendente', password: '' })

  const load = () => {
    setLoading(true)
    listUsers()
      .then((result) => {
        setUsers(result.users)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleCreateUser(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await createUser({
        name: form.name,
        email: form.email,
        role: form.role,
        password: form.password || undefined,
      })
      setForm({ name: '', email: '', role: 'atendente', password: '' })
      setMessage('Usuário criado com sucesso.')
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível criar o usuário.')
    } finally {
      setSaving(false)
    }
  }

  async function handleUpdateUser(userId: string, input: Partial<{ role: string; active: boolean }>) {
    setMessage('')
    setError('')
    try {
      const result = await updateUser(userId, input)
      setUsers((current) => current.map((user) => (user.id === userId ? result.user : user)))
      setMessage('Usuário atualizado.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Não foi possível atualizar o usuário.')
    }
  }

  return (
    <div>
      <Topbar title="Gestão de usuários" action="Configurações do grupo" />
      <div className="space-y-5 p-5">
        <form className="grid gap-3 bg-white p-5 text-sm lg:grid-cols-[1fr_1fr_180px_180px_auto]" onSubmit={handleCreateUser}>
          <input className="input" value={form.name} onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))} placeholder="Nome do usuário" required />
          <input className="input" type="email" value={form.email} onChange={(event) => setForm((current) => ({ ...current, email: event.target.value }))} placeholder="email@empresa.com" required />
          <select className="input" value={form.role} onChange={(event) => setForm((current) => ({ ...current, role: event.target.value }))}>
            <option value="atendente">Atendente</option>
            <option value="gerente">Gerente</option>
            <option value="admin">Administrador</option>
          </select>
          <input className="input" type="password" value={form.password} onChange={(event) => setForm((current) => ({ ...current, password: event.target.value }))} placeholder="Senha inicial" />
          <button className="rounded bg-blue-600 px-4 py-2 font-semibold text-white disabled:opacity-60" disabled={saving}>{saving ? 'Salvando...' : '+ Adicionar usuário'}</button>
        </form>

        {message && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}

        <div className="overflow-auto bg-white text-sm">
          <table className="min-w-[920px] w-full border-collapse">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {['Nome', 'E-mail', 'Papel', 'Leads', 'Contatos', 'Empresas', 'Status', 'Criado em', 'Ações'].map((col) => <th key={col} className="border-b border-slate-200 px-4 py-3">{col}</th>)}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-4 py-6 text-slate-400" colSpan={9}>Carregando usuários...</td></tr>}
              {!loading && users.length === 0 && <tr><td className="px-4 py-6 text-slate-400" colSpan={9}>Nenhum usuário cadastrado.</td></tr>}
              {users.map((user) => (
                <tr key={user.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium text-blue-700">{user.name}</td>
                  <td className="px-4 py-3">{user.email}</td>
                  <td className="px-4 py-3">
                    <select className="rounded border border-slate-200 px-2 py-1 text-xs" value={user.role} onChange={(event) => handleUpdateUser(user.id, { role: event.target.value })}>
                      <option value="atendente">Atendente</option>
                      <option value="gerente">Gerente</option>
                      <option value="admin">Administrador</option>
                    </select>
                  </td>
                  <td className="px-4 py-3">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3">{roleLabel(user.role)}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded px-2 py-1 text-xs font-semibold ${user.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
                      {user.active ? 'Ativo' : 'Inativo'}
                    </span>
                  </td>
                  <td className="px-4 py-3">{new Date(user.created_at).toLocaleDateString('pt-BR')}</td>
                  <td className="px-4 py-3">
                    <button className="rounded border border-slate-200 px-3 py-1 text-xs font-semibold" onClick={() => handleUpdateUser(user.id, { active: !user.active })}>
                      {user.active ? 'Desativar' : 'Ativar'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}

function roleLabel(role: string) {
  if (role === 'admin') return 'Administrador'
  if (role === 'gerente' || role === 'manager') return 'Gerente'
  return 'Atendente'
}

function WorkspaceSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    workspace_name: '',
    cnpj: '',
    phone: '',
    email: '',
    address: '',
    timezone: 'America/Sao_Paulo',
    currency: 'BRL',
    business_start: '08:00',
    business_end: '18:00',
  })

  useEffect(() => {
    getTenantSettings()
      .then((res) => {
        setForm({
          workspace_name: res.settings.workspace_name || '',
          cnpj: res.settings.cnpj || '',
          phone: res.settings.phone || '',
          email: res.settings.email || '',
          address: res.settings.address || '',
          timezone: res.settings.timezone || 'America/Sao_Paulo',
          currency: res.settings.currency || 'BRL',
          business_start: res.settings.business_hours?.start || '08:00',
          business_end: res.settings.business_hours?.end || '18:00',
        })
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await updateTenantSettings({
        workspace_name: form.workspace_name.trim(),
        cnpj: form.cnpj.trim() || null,
        phone: form.phone.trim() || null,
        email: form.email.trim() || null,
        address: form.address.trim() || null,
        timezone: form.timezone,
        currency: form.currency,
        business_hours: {
          enabled: true,
          start: form.business_start,
          end: form.business_end,
          days: [1, 2, 3, 4, 5],
        },
      })
      setMessage('Configurações da área de trabalho salvas com sucesso.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SettingsHeader title="Configurações da Área de Trabalho" />
      <div className="space-y-6 p-6 max-w-4xl">
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-8 text-center text-xs text-slate-400">Carregando configurações...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Identidade & Dados Cadastrais da Empresa
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Nome da Empresa / Workspace *
                  </label>
                  <input
                    required
                    type="text"
                    value={form.workspace_name}
                    onChange={(e) => setForm({ ...form, workspace_name: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600 font-semibold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    CNPJ / Documento
                  </label>
                  <input
                    type="text"
                    placeholder="00.000.000/0001-00"
                    value={form.cnpj}
                    onChange={(e) => setForm({ ...form, cnpj: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Telefone Comercial Principal
                  </label>
                  <input
                    type="text"
                    placeholder="+55 11 99999-9999"
                    value={form.phone}
                    onChange={(e) => setForm({ ...form, phone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    E-mail Comercial
                  </label>
                  <input
                    type="email"
                    placeholder="contato@avilaops.com"
                    value={form.email}
                    onChange={(e) => setForm({ ...form, email: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>

                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Endereço / Sede
                  </label>
                  <input
                    type="text"
                    placeholder="Av. Paulista, 1000 - São Paulo, SP"
                    value={form.address}
                    onChange={(e) => setForm({ ...form, address: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </section>

            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Localização & Horário de Atendimento
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Fuso Horário Operacional
                  </label>
                  <select
                    value={form.timezone}
                    onChange={(e) => setForm({ ...form, timezone: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                  >
                    <option value="America/Sao_Paulo">Brasília (GMT-3)</option>
                    <option value="America/Manaus">Manaus (GMT-4)</option>
                    <option value="UTC">UTC / Internacional</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Moeda Padrão de Negócios
                  </label>
                  <select
                    value={form.currency}
                    onChange={(e) => setForm({ ...form, currency: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                  >
                    <option value="BRL">Real Brasileiro (BRL - R$)</option>
                    <option value="USD">Dólar Americano (USD - $)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Horário Comercial - Abertura
                  </label>
                  <input
                    type="time"
                    value={form.business_start}
                    onChange={(e) => setForm({ ...form, business_start: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    Horário Comercial - Fechamento
                  </label>
                  <input
                    type="time"
                    value={form.business_end}
                    onChange={(e) => setForm({ ...form, business_end: e.target.value })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Alterações'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function ChatSettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    welcome_message: '',
    away_message: '',
    auto_assign: true,
    sla_minutes: 15,
  })

  useEffect(() => {
    getTenantSettings()
      .then((res) => {
        setForm({
          welcome_message: res.settings.welcome_message || '',
          away_message: res.settings.away_message || '',
          auto_assign: res.settings.auto_assign ?? true,
          sla_minutes: res.settings.sla_minutes || 15,
        })
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await updateTenantSettings({
        welcome_message: form.welcome_message.trim() || null,
        away_message: form.away_message.trim() || null,
        auto_assign: form.auto_assign,
        sla_minutes: Number(form.sla_minutes) || 15,
      })
      setMessage('Regras de atendimento do chat salvas com sucesso.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar regras.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SettingsHeader title="Configurações de Chat & Atendimento" />
      <div className="space-y-6 p-6 max-w-4xl">
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-8 text-center text-xs text-slate-400">Carregando regras de chat...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Mensagens Automáticas de WhatsApp
              </h3>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Mensagem de Boas-Vindas (Primeiro Contato)
                </label>
                <textarea
                  rows={3}
                  value={form.welcome_message}
                  onChange={(e) => setForm({ ...form, welcome_message: e.target.value })}
                  placeholder="Olá! Seja bem-vindo. Como posso te ajudar hoje?"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-600 leading-relaxed"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Mensagem de Ausência (Fora do Horário Comercial)
                </label>
                <textarea
                  rows={3}
                  value={form.away_message}
                  onChange={(e) => setForm({ ...form, away_message: e.target.value })}
                  placeholder="Nosso atendimento funciona de seg a sex das 08h às 18h. Responderemos em breve!"
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-600 leading-relaxed"
                />
              </div>
            </section>

            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Distribuição de Conversas & SLA
              </h3>

              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                    SLA Máximo de Primeira Resposta (Minutos)
                  </label>
                  <input
                    type="number"
                    min={1}
                    max={1440}
                    value={form.sla_minutes}
                    onChange={(e) => setForm({ ...form, sla_minutes: Number(e.target.value) })}
                    className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                  />
                  <p className="mt-1 text-[11px] text-slate-400">Tempo limite antes de emitir alerta de atendimento atrasado.</p>
                </div>

                <div className="flex flex-col justify-center">
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-800 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.auto_assign}
                      onChange={(e) => setForm({ ...form, auto_assign: e.target.checked })}
                      className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    Distribuir novos leads automaticamente entre atendentes ativos (Round-Robin)
                  </label>
                </div>
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Regras de Chat'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function AISettings() {
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const [form, setForm] = useState({
    ai_copilot_enabled: true,
    ai_autonomous_reply: false,
    ai_tone: 'consultivo',
    ai_custom_instructions: '',
  })

  useEffect(() => {
    getTenantSettings()
      .then((res) => {
        setForm({
          ai_copilot_enabled: res.settings.ai_copilot_enabled ?? true,
          ai_autonomous_reply: res.settings.ai_autonomous_reply ?? false,
          ai_tone: res.settings.ai_tone || 'consultivo',
          ai_custom_instructions: res.settings.ai_custom_instructions || '',
        })
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setMessage('')
    setError('')
    try {
      await updateTenantSettings({
        ai_copilot_enabled: form.ai_copilot_enabled,
        ai_autonomous_reply: form.ai_autonomous_reply,
        ai_tone: form.ai_tone,
        ai_custom_instructions: form.ai_custom_instructions.trim() || null,
      })
      setMessage('Diretrizes e configurações da Inteligência Artificial salvas.')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Falha ao salvar configurações de IA.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div>
      <SettingsHeader title="Inteligência Artificial & Copilot Comercial" />
      <div className="space-y-6 p-6 max-w-4xl">
        {message && (
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-700">
            {message}
          </div>
        )}
        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        {loading ? (
          <div className="bg-white p-8 text-center text-xs text-slate-400">Carregando configurações de IA...</div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-6">
            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Modo de Operação do Agente
              </h3>

              <div className="space-y-3">
                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={form.ai_copilot_enabled}
                    onChange={(e) => setForm({ ...form, ai_copilot_enabled: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Ativar Copilot & Sugestão de Respostas</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Gera rascunhos em tempo real para os atendentes aprovarem com 1 clique antes do envio.
                    </p>
                  </div>
                </label>

                <label className="flex items-start gap-3 rounded-lg border border-slate-200 p-4 cursor-pointer hover:bg-slate-50 transition">
                  <input
                    type="checkbox"
                    checked={form.ai_autonomous_reply}
                    onChange={(e) => setForm({ ...form, ai_autonomous_reply: e.target.checked })}
                    className="mt-0.5 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">Atendimento 100% Autônomo (Piloto Automático)</h4>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Permite que a IA responda mensagens de forma autônoma utilizando as Fontes de Conhecimento RAG.
                    </p>
                  </div>
                </label>
              </div>
            </section>

            <section className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm space-y-4">
              <h3 className="text-sm font-bold text-slate-900 border-b border-slate-100 pb-2">
                Personalidade & Instruções Comerciais
              </h3>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Tom de Voz da IA
                </label>
                <select
                  value={form.ai_tone}
                  onChange={(e) => setForm({ ...form, ai_tone: e.target.value })}
                  className="mt-1 w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold text-slate-700 outline-none focus:border-blue-600"
                >
                  <option value="consultivo">Consultivo & Estratégico (Recomendado para Vendas)</option>
                  <option value="amigavel">Amigável & Descontraído</option>
                  <option value="formal">Formal & Corporativo</option>
                  <option value="tecnico">Técnico & Preciso</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Instruções Mestres (System Prompt)
                </label>
                <textarea
                  rows={5}
                  value={form.ai_custom_instructions}
                  onChange={(e) => setForm({ ...form, ai_custom_instructions: e.target.value })}
                  placeholder="Oriente a IA sobre como apresentar a empresa, metas de qualificação e critérios para agendar reuniões..."
                  className="mt-1 w-full rounded-lg border border-slate-200 p-3 text-xs outline-none focus:border-blue-600 leading-relaxed font-sans"
                />
              </div>
            </section>

            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving}
                className="rounded-lg bg-blue-600 px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {saving ? 'Salvando...' : 'Salvar Diretrizes de IA'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  )
}

function Knowledge() {
  const [sources, setSources] = useState<KnowledgeSource[]>([])
  const [loading, setLoading] = useState(true)
  const [showModal, setShowModal] = useState(false)
  const [error, setError] = useState('')

  const loadSources = () => {
    setLoading(true)
    listKnowledgeSources()
      .then((res) => {
        setSources(res.sources)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    loadSources()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover esta fonte de conhecimento?')) return
    try {
      await deleteKnowledgeSource(id)
      loadSources()
    } catch (err: unknown) {
      alert(err instanceof Error ? err.message : 'Falha ao remover fonte.')
    }
  }

  const handleToggle = async (id: string, active: boolean) => {
    try {
      await updateKnowledgeSource(id, { active: !active })
      loadSources()
    } catch (err: unknown) {
      console.error(err)
    }
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'document':
        return <FileText size={15} className="text-indigo-600" />
      case 'guideline':
        return <Shield size={15} className="text-amber-600" />
      case 'faq':
      default:
        return <HelpCircle size={15} className="text-blue-600" />
    }
  }

  return (
    <div>
      <SettingsHeader title="Fontes de Conhecimento RAG da IA" />
      <div className="p-6 space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Bases de Conhecimento Indexadas</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              A IA consulta essas fontes antes de responder qualquer dúvida técnica, preço ou processo comercial.
            </p>
          </div>
          <button
            className="flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700 shadow-sm"
            onClick={() => setShowModal(true)}
          >
            <Plus size={15} />
            <span>Adicionar Fonte</span>
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-xs font-semibold text-red-700">
            {error}
          </div>
        )}

        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full border-collapse text-left text-xs">
            <thead className="bg-slate-50 uppercase text-slate-500 border-b border-slate-200">
              <tr>
                <th className="px-4 py-3 font-semibold">Nome da Fonte</th>
                <th className="px-4 py-3 font-semibold">Tipo</th>
                <th className="px-4 py-3 font-semibold">Consultas Realizadas</th>
                <th className="px-4 py-3 font-semibold">Status</th>
                <th className="px-4 py-3 font-semibold">Atualizado em</th>
                <th className="px-4 py-3 font-semibold text-right">Ações</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400">
                    Carregando fontes de conhecimento...
                  </td>
                </tr>
              )}
              {!loading && sources.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-400">
                    <Sparkles size={32} className="mx-auto mb-2 text-slate-300" />
                    Nenhuma fonte de conhecimento adicionada. Cadastre FAQs ou catálogos para treinar o agente.
                  </td>
                </tr>
              )}
              {!loading &&
                sources.map((src) => (
                  <tr key={src.id} className="hover:bg-slate-50 transition">
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        {getTypeIcon(src.type)}
                        <span className="font-bold text-slate-900">{src.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-slate-600">
                        {src.type}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono font-bold text-slate-700">{src.times_used}x</td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggle(src.id, src.active)}
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase transition ${
                          src.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                        }`}
                      >
                        {src.active ? 'Ativo' : 'Pausado'}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-slate-400">{new Date(src.updated_at).toLocaleDateString('pt-BR')}</td>
                    <td className="px-4 py-3 text-right">
                      <button
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-red-600"
                        onClick={() => handleDelete(src.id)}
                        title="Excluir Fonte"
                      >
                        <Trash2 size={14} />
                      </button>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </div>

      {showModal && (
        <KnowledgeModal
          onClose={() => setShowModal(false)}
          onCreated={() => {
            loadSources()
            setShowModal(false)
          }}
        />
      )}
    </div>
  )
}


function Channels() {
  const [channels, setChannels] = useState<CrmChannel[]>([])
  const [loading, setLoading] = useState(true)
  const [syncing, setSyncing] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')

  const load = () => {
    setLoading(true)
    listChannels()
      .then((result) => {
        setChannels(result.channels)
        setError('')
      })
      .catch((err: Error) => setError(err.message))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    load()
  }, [])

  async function handleSync() {
    setSyncing(true)
    setMessage('')
    setError('')
    try {
      const result = await syncMetaChannels()
      setMessage(`${result.total} canal(is) sincronizado(s): ${result.created} criado(s), ${result.updated} atualizado(s).`)
      load()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setSyncing(false)
    }
  }

  return (
    <div>
      <SettingsHeader title="Canais Meta" />
      <div className="space-y-4 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-5">
          <div>
            <h3 className="font-semibold">Números conectados</h3>
            <p className="mt-1 text-sm text-slate-500">Sincronize os números do WhatsApp Business autorizados na conta Meta.</p>
          </div>
          <button className="rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60" onClick={handleSync} disabled={syncing}>
            {syncing ? 'Sincronizando...' : 'Sincronizar números da Meta'}
          </button>
        </div>
        {message && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        <div className="overflow-auto bg-white">
          <table className="min-w-[980px] w-full border-collapse text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
              <tr>
                {['Nome verificado', 'WhatsApp', 'phone_number_id', 'waba_id', 'Status', 'Qualidade', 'Última sincronização', 'Empresa/equipe', 'Erro'].map((column) => (
                  <th key={column} className="border-b border-slate-200 px-4 py-3">{column}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td className="px-4 py-6 text-slate-400" colSpan={9}>Carregando canais...</td></tr>}
              {!loading && channels.length === 0 && <tr><td className="px-4 py-6 text-slate-400" colSpan={9}>Nenhum número sincronizado.</td></tr>}
              {channels.map((channel) => (
                <tr key={channel.id} className="border-b border-slate-100">
                  <td className="px-4 py-3 font-medium">{String(channel.metadata.verified_name ?? channel.display_name)}</td>
                  <td className="px-4 py-3">{channel.phone_number ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{channel.external_id ?? '-'}</td>
                  <td className="px-4 py-3 font-mono text-xs">{String(channel.metadata.waba_id ?? '-')}</td>
                  <td className="px-4 py-3"><span className="rounded bg-emerald-100 px-2 py-1 text-xs font-semibold text-emerald-700">{channel.status}</span></td>
                  <td className="px-4 py-3">{String(channel.metadata.quality_rating ?? '-')}</td>
                  <td className="px-4 py-3">{channel.last_sync_at ? new Date(channel.last_sync_at).toLocaleString('pt-BR') : '-'}</td>
                  <td className="px-4 py-3">{channel.team_name ?? String(channel.metadata.business_name ?? '-')}</td>
                  <td className="px-4 py-3 text-red-600">{channel.error_message ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
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

        <div className="mb-6 rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <div className="grid h-8 w-8 place-items-center rounded bg-emerald-100 font-bold text-xs text-emerald-700">G</div>
                <h3 className="font-bold text-slate-900">Google Calendar (Google Agenda)</h3>
              </div>
              <p className="mt-1 text-sm text-slate-500">
                Sincronização em background de tarefas, reuniões e lembretes com sua conta do Google Workspace.
              </p>
            </div>
            <button
              className="rounded bg-emerald-600 px-4 py-2 text-xs font-semibold text-white hover:bg-emerald-700"
              onClick={async () => {
                try {
                  const data = await getGoogleAuthUrl()
                  window.location.href = data.url
                } catch {
                  alert('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET para autenticação OAuth2 no servidor.')
                }
              }}
            >
              Conectar Google Agenda
            </button>
          </div>
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


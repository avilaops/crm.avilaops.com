import { CheckCircle2, XCircle } from 'lucide-react'
import { useState } from 'react'
import { Notice } from '../../components/ui/Form'
import { Sheet } from '../../components/ui/Sheet'
import { CostSimulator, PriceSummary, PriceTable } from '../../components/whatsapp/Pricing'
import { tabelaVigente } from '../../data/whatsappPricing'
import { formatBRL } from '../../lib/format'
import { useSession } from '../../lib/session'
import { supportLinks } from '../../lib/support'
import { buttonClass } from '../../lib/ui'
import { SettingsFrame } from './SettingsFrame'

type Cycle = 'monthly' | 'yearly'

// Conteúdo comercial dos planos mantido como estava; só a caixa alta saiu.
const plans = [
  {
    id: 'start',
    name: 'Start',
    description: 'Ideal para profissionais autônomos e pequenos negócios iniciando no WhatsApp.',
    monthly: 97,
    yearly: 79,
    featured: false,
    features: ['1 número de WhatsApp oficial', '2 usuários / atendentes', 'Até 1.000 contatos e leads', 'Inbox com SLA e atribuição', 'Funil de vendas Kanban', 'Até 500 e-mails de newsletter/mês'],
    limitations: ['Sem automações n8n', 'Sem agente de IA generativa'],
  },
  {
    id: 'pro',
    name: 'Pro',
    description: 'O sistema operacional completo para empresas que querem escalar vendas e atendimento.',
    monthly: 247,
    yearly: 197,
    featured: true,
    features: [
      '3 números de WhatsApp oficial + Instagram',
      '10 usuários / atendentes',
      'Contatos, empresas e leads ilimitados',
      'Automações comerciais e webhooks n8n',
      'Agente de IA comercial com base de conhecimento',
      'Campanhas de newsletter ilimitadas',
      'Integração com ERP e Google Agenda',
      'Suporte prioritário via WhatsApp',
    ],
    limitations: [],
  },
  {
    id: 'enterprise',
    name: 'Enterprise',
    description: 'Estrutura robusta com múltiplos funis, consultoria e performance dedicada.',
    monthly: 697,
    yearly: 547,
    featured: false,
    features: [
      'Números de WhatsApp e atendentes ilimitados',
      'Múltiplos funis de vendas customizados',
      'Instância e IP dedicados de alta performance',
      'Consultoria de fluxos n8n pela equipe Ávila Ops',
      'SLA de atendimento em até 15 minutos',
      'Trilha completa de auditoria e segurança avançada',
    ],
    limitations: [],
  },
]

const addons = [
  { title: 'Pacote de tokens de IA (100 mil)', price: 49 },
  { title: 'Número de WhatsApp adicional', price: 39 },
  { title: 'Armazenamento de 50 GB', price: 29 },
  { title: 'Usuário / atendente extra', price: 25 },
]

/**
 * Área de trabalho › Faturamento.
 *
 * O botão "Assinar" abria um checkout de mentira: esperava 1,2 segundo e dizia
 * "Assinatura ativada com sucesso" sem cobrar nada nem mudar plano nenhum. Uma
 * pessoa podia sair dali achando que contratou. Enquanto a cobrança do plano
 * não estiver ligada a um gateway de verdade, contratar é falar com a equipe.
 * A aba de consumo, que mostrava números fixos ("142 leads", "864 contatos"),
 * deu lugar ao custo do WhatsApp, que tem tabela e conta de verdade.
 */
export function BillingSettings() {
  const { user } = useSession()
  const [tab, setTab] = useState<'plano' | 'whatsapp'>('plano')
  const [cycle, setCycle] = useState<Cycle>('monthly')
  const [intent, setIntent] = useState<string | null>(null)
  const tabela = tabelaVigente()
  const links = intent ? supportLinks(`Olá! Quero contratar: ${intent}. Sou ${user.name} (${user.email}).`, `Contratar ${intent}`) : null

  return (
    <SettingsFrame page="billing" title="Faturamento" wide>
      <div className="space-y-5">
        <div className="scroll-chips -mx-4 flex gap-1 border-b border-slate-200 px-4" role="tablist" aria-label="Faturamento">
          {[
            ['plano', 'Plano'],
            ['whatsapp', 'Custo do WhatsApp'],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id as typeof tab)}
              className={`-mb-px inline-flex min-h-11 shrink-0 items-center border-b-2 px-3 text-sm font-medium ${
                tab === id ? 'border-blue-600 text-blue-700' : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'plano' && (
          <div className="@container space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm text-slate-600">Para contratar ou mudar de plano, fale com a equipe Ávila Ops.</p>
              <div className="inline-flex rounded-full bg-slate-200/70 p-1 text-sm font-medium" role="group" aria-label="Ciclo de cobrança">
                {(['monthly', 'yearly'] as const).map((value) => (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={cycle === value}
                    onClick={() => setCycle(value)}
                    className={`min-h-11 rounded-full px-4 ${cycle === value ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-600'}`}
                  >
                    {value === 'monthly' ? 'Mensal' : 'Anual (−20%)'}
                  </button>
                ))}
              </div>
            </div>

            <ul className="grid gap-4 @3xl:grid-cols-3">
              {plans.map((plan) => {
                const price = cycle === 'yearly' ? plan.yearly : plan.monthly
                return (
                  <li
                    key={plan.id}
                    className={`flex flex-col rounded-xl bg-white p-5 ${plan.featured ? 'border-2 border-blue-600' : 'border border-slate-200'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-lg font-semibold text-slate-900">{plan.name}</h3>
                      {plan.featured && <span className="rounded-full bg-blue-600 px-2.5 py-0.5 text-xs font-semibold text-white">Mais escolhido</span>}
                    </div>
                    <p className="mt-1 text-sm text-slate-500">{plan.description}</p>
                    <p className="mt-4">
                      <span className="text-3xl font-semibold tabular-nums text-slate-900">{formatBRL(price)}</span>
                      <span className="text-sm text-slate-500">/mês{cycle === 'yearly' ? ', cobrado por ano' : ''}</span>
                    </p>
                    <ul className="mt-4 flex-1 space-y-2 text-sm text-slate-700">
                      {plan.features.map((feature) => (
                        <li key={feature} className="flex gap-2">
                          <CheckCircle2 size={16} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
                          {feature}
                        </li>
                      ))}
                      {plan.limitations.map((limitation) => (
                        <li key={limitation} className="flex gap-2 text-slate-500">
                          <XCircle size={16} className="mt-0.5 shrink-0 text-slate-400" aria-hidden="true" />
                          {limitation}
                        </li>
                      ))}
                    </ul>
                    <button
                      type="button"
                      className={`${plan.featured ? buttonClass.primary : buttonClass.secondary} mt-5 w-full`}
                      onClick={() => setIntent(`plano ${plan.name} (${cycle === 'yearly' ? 'anual' : 'mensal'})`)}
                    >
                      Quero o {plan.name}
                    </button>
                  </li>
                )
              })}
            </ul>

            <section className="rounded-xl border border-slate-200 bg-white p-4 medium:p-5">
              <h3 className="font-semibold text-slate-900">Complementos</h3>
              <ul className="mt-3 divide-y divide-slate-100">
                {addons.map((addon) => (
                  <li key={addon.title} className="flex min-h-14 items-center justify-between gap-3 py-2">
                    <span className="text-sm text-slate-800">{addon.title}</span>
                    <span className="flex shrink-0 items-center gap-3">
                      <span className="text-sm font-semibold tabular-nums text-slate-900">{formatBRL(addon.price)}/mês</span>
                      <button type="button" className={buttonClass.ghost} onClick={() => setIntent(addon.title.toLowerCase())}>
                        Pedir
                      </button>
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          </div>
        )}

        {tab === 'whatsapp' && (
          <div className="@container">
            <div className="grid gap-5 @3xl:grid-cols-2 @3xl:items-start">
              <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 medium:p-5">
                <h3 className="font-semibold text-slate-900">Quanto a Meta cobra</h3>
                <PriceSummary tabela={tabela} />
                <PriceTable tabela={tabela} />
              </section>
              <div className="grid gap-4">
                <CostSimulator tabela={tabela} />
                <Notice tone="neutral">O consumo real do mês, por categoria, aparece aqui quando a Messageria passar a informar o custo de cada mensagem enviada.</Notice>
              </div>
            </div>
          </div>
        )}
      </div>

      <Sheet open={intent !== null} onClose={() => setIntent(null)} title="Falar com a Ávila Ops" description={intent ? `Sobre: ${intent}.` : undefined}
        footer={
          links && (links.whatsapp || links.email) ? (
            <div className="grid gap-2 medium:flex medium:justify-end">
              {links.email && <a className={buttonClass.secondary} href={links.email}>Enviar por e-mail</a>}
              {links.whatsapp && <a className={buttonClass.primary} href={links.whatsapp} target="_blank" rel="noreferrer">Chamar no WhatsApp</a>}
            </div>
          ) : undefined
        }
      >
        <p className="text-[15px] leading-relaxed text-slate-700">
          A equipe confirma o plano, a forma de pagamento e libera na sua conta. Nada é cobrado antes dessa conversa.
        </p>
        {links && !links.whatsapp && !links.email && (
          <div className="mt-4"><Notice tone="info">Peça a quem administra a sua conta Ávila Ops para fazer a contratação.</Notice></div>
        )}
      </Sheet>
    </SettingsFrame>
  )
}

import { useState } from 'react'
import {
  ArrowRight,
  Calendar,
  CreditCard,
  Database,
  MessageSquare,
  Server,
  ShieldCheck,
  Workflow,
  X,
} from 'lucide-react'
import { getGoogleAuthUrl } from '../../lib/googleCalendar'

export default function IntegrationCenterPage() {
  const [modalIntegration, setModalIntegration] = useState<string | null>(null)

  const [n8nUrl, setN8nUrl] = useState(() => localStorage.getItem('avila_n8n_url') || 'https://n8n.avilaops.com')
  const [n8nKey, setN8nKey] = useState(() => localStorage.getItem('avila_n8n_key') || '')
  const [erpUrl, setErpUrl] = useState(() => localStorage.getItem('avila_erp_url') || 'https://erp.avilaops.com/api')
  const [erpKey, setErpKey] = useState(() => localStorage.getItem('avila_erp_key') || '')
  const [twilioSid, setTwilioSid] = useState(() => localStorage.getItem('avila_twilio_sid') || '')
  const [twilioToken, setTwilioToken] = useState(() => localStorage.getItem('avila_twilio_token') || '')

  const [savedMsg, setSavedMsg] = useState('')

  const handleSaveConfigs = (e: React.FormEvent) => {
    e.preventDefault()
    localStorage.setItem('avila_n8n_url', n8nUrl)
    localStorage.setItem('avila_n8n_key', n8nKey)
    localStorage.setItem('avila_erp_url', erpUrl)
    localStorage.setItem('avila_erp_key', erpKey)
    localStorage.setItem('avila_twilio_sid', twilioSid)
    localStorage.setItem('avila_twilio_token', twilioToken)

    setSavedMsg('Configurações salvas localmente com sucesso!')
    setTimeout(() => {
      setSavedMsg('')
      setModalIntegration(null)
    }, 1500)
  }

  const integrations = [
    {
      id: 'n8n',
      name: 'n8n Automation Engine',
      category: 'Automação & Webhooks',
      description: 'Dispare réguas de automação, fluxos inteligentes e integração com bots no n8n.',
      icon: Workflow,
      iconBg: 'bg-orange-500',
      connected: !!n8nKey || true,
      badge: 'Prioritário',
      badgeColor: 'bg-orange-100 text-orange-800',
    },
    {
      id: 'meta',
      name: 'Meta WhatsApp & Instagram',
      category: 'Mensageiros Oficiais',
      description: 'API oficial do WhatsApp Cloud e Direct do Instagram com templates aprovados.',
      icon: MessageSquare,
      iconBg: 'bg-emerald-500',
      connected: true,
      badge: 'Oficial',
      badgeColor: 'bg-emerald-100 text-emerald-800',
    },
    {
      id: 'erp',
      name: 'ERP Ávila Ops (erp.avilaops.com)',
      category: 'Gestão Financeira & Pedidos',
      description: 'Sincronize clientes ganhos, pedidos e emissão de notas com o ecossistema Ávila Ops.',
      icon: Database,
      iconBg: 'bg-blue-600',
      connected: !!erpKey,
      badge: 'Nativo',
      badgeColor: 'bg-blue-100 text-blue-800',
    },
    {
      id: 'twilio',
      name: 'Twilio (SMS & Fallback WhatsApp)',
      category: 'Telefonia & Notificações',
      description: 'Envio de SMS transacional e rota de contingência para alertas operacionais.',
      icon: Server,
      iconBg: 'bg-rose-500',
      connected: !!twilioSid,
      badge: 'Stack Ávila',
      badgeColor: 'bg-rose-100 text-rose-800',
    },
    {
      id: 'google',
      name: 'Google Calendar (Agenda)',
      category: 'Produtividade',
      description: 'Sincronização de reuniões comerciais, tarefas e follow-ups na sua Google Agenda.',
      icon: Calendar,
      iconBg: 'bg-indigo-600',
      connected: false,
      badge: 'OAuth2',
      badgeColor: 'bg-indigo-100 text-indigo-800',
    },
    {
      id: 'gateways',
      name: 'Gateways de Pagamento (Éfi & MP)',
      category: 'Cobrança & Pix',
      description: 'Cobrança com Pix instantâneo, QR Code e links de pagamento via Éfi e Mercado Pago.',
      icon: CreditCard,
      iconBg: 'bg-teal-600',
      connected: true,
      badge: '3 Gateways',
      badgeColor: 'bg-teal-100 text-teal-800',
    },
  ]

  return (
    <div>
      <div className="flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6">
        <div>
          <h2 className="text-base font-bold text-slate-900">Central de Integrações Ávila Ops</h2>
          <p className="text-xs text-slate-400">Conecte seus serviços de automação, mensageria e ERP.</p>
        </div>
      </div>

      <div className="space-y-6 p-6">
        {/* Banner de Boas Práticas da Stack */}
        <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-4">
          <div className="flex items-start gap-3">
            <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-blue-600 text-white font-bold">
              <ShieldCheck size={16} />
            </div>
            <div>
              <h4 className="text-xs font-bold text-blue-900">Padrão de Integração Homologado Ávila Ops</h4>
              <p className="text-xs text-blue-800/80 mt-0.5 leading-relaxed">
                Prioridade operacional: <strong>n8n</strong> para fluxos e réguas de relacionamento, <strong>Meta Cloud API</strong> e <strong>Twilio</strong> para mensagens, e faturamento via <strong>Éfi, Mercado Pago e PayPal</strong>.
              </p>
            </div>
          </div>
        </div>

        {/* Grid de Cards de Integrações */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {integrations.map((item) => {
            const Icon = item.icon
            return (
              <div
                key={item.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm hover:border-slate-300 transition"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className={`grid h-11 w-11 place-items-center rounded-xl text-white ${item.iconBg}`}>
                      <Icon size={22} />
                    </div>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${item.badgeColor}`}>
                      {item.badge}
                    </span>
                  </div>

                  <h3 className="mt-4 text-xs font-bold text-slate-900">{item.name}</h3>
                  <span className="text-[11px] font-semibold text-slate-400">{item.category}</span>
                  <p className="mt-2 text-xs text-slate-600 leading-relaxed">{item.description}</p>
                </div>

                <div className="mt-5 flex items-center justify-between border-t border-slate-100 pt-3">
                  <div className="flex items-center gap-1.5 text-[11px] font-bold">
                    <span className={`h-2 w-2 rounded-full ${item.connected ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                    <span className={item.connected ? 'text-emerald-700' : 'text-slate-500'}>
                      {item.connected ? 'Ativo' : 'Não configurado'}
                    </span>
                  </div>

                  <button
                    className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:text-blue-700 hover:underline"
                    onClick={() => {
                      if (item.id === 'google') {
                        getGoogleAuthUrl()
                          .then((res) => {
                            window.location.href = res.url
                          })
                          .catch(() => alert('Configure GOOGLE_CLIENT_ID e GOOGLE_CLIENT_SECRET no servidor.'))
                      } else {
                        setModalIntegration(item.id)
                      }
                    }}
                  >
                    <span>Configurar</span>
                    <ArrowRight size={13} />
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Modal de Configuração de Integração */}
      {modalIntegration && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-xl bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-bold text-slate-900">
                Configurar {integrations.find((i) => i.id === modalIntegration)?.name}
              </h3>
              <button className="text-slate-400 hover:text-slate-600" onClick={() => setModalIntegration(null)}>
                <X size={18} />
              </button>
            </div>

            {savedMsg && (
              <div className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-700">
                {savedMsg}
              </div>
            )}

            <form onSubmit={handleSaveConfigs} className="mt-4 space-y-4">
              {modalIntegration === 'n8n' && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      URL da Instância n8n
                    </label>
                    <input
                      type="url"
                      value={n8nUrl}
                      onChange={(e) => setN8nUrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      API Key do n8n (Opcional)
                    </label>
                    <input
                      type="password"
                      placeholder="n8n_api_..."
                      value={n8nKey}
                      onChange={(e) => setN8nKey(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div className="rounded-lg bg-slate-50 p-3 text-[11px] text-slate-500">
                    💡 Para criar gatilhos automatizados que enviam dados para o seu n8n, utilize a aba <strong>Automações</strong> no menu lateral.
                  </div>
                </>
              )}

              {modalIntegration === 'erp' && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Endpoint API do ERP Ávila Ops
                    </label>
                    <input
                      type="url"
                      value={erpUrl}
                      onChange={(e) => setErpUrl(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Chave de Acesso / Token ERP
                    </label>
                    <input
                      type="password"
                      placeholder="erp_sec_..."
                      value={erpKey}
                      onChange={(e) => setErpKey(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                </>
              )}

              {modalIntegration === 'twilio' && (
                <>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Twilio Account SID
                    </label>
                    <input
                      type="text"
                      placeholder="AC..."
                      value={twilioSid}
                      onChange={(e) => setTwilioSid(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                      Twilio Auth Token
                    </label>
                    <input
                      type="password"
                      placeholder="token..."
                      value={twilioToken}
                      onChange={(e) => setTwilioToken(e.target.value)}
                      className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-xs font-mono outline-none focus:border-blue-600"
                    />
                  </div>
                </>
              )}

              {modalIntegration === 'meta' && (
                <div className="space-y-3 text-xs text-slate-600">
                  <p>
                    As credenciais do <strong>Meta WhatsApp Cloud API</strong> e <strong>Instagram</strong> são gerenciadas de forma centralizada e segura no servidor.
                  </p>
                  <p>
                    Acesse a seção <strong>Fontes de Lead</strong> ou <strong>Canais Meta</strong> para sincronizar números autorizados e gerenciar webhooks.
                  </p>
                </div>
              )}

              {modalIntegration === 'gateways' && (
                <div className="space-y-3 text-xs text-slate-600">
                  <p>
                    Os pagamentos e checkouts são processados pelos 3 gateways oficiais: <strong>Éfi Pay</strong>, <strong>Mercado Pago</strong> e <strong>PayPal</strong>.
                  </p>
                  <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                    <p className="font-bold text-slate-800">Status dos Gateways:</p>
                    <ul className="mt-1 space-y-1 text-slate-600">
                      <li>✔ <strong>Éfi Pay:</strong> Pix imediato com conciliação bancária ativa.</li>
                      <li>✔ <strong>Mercado Pago:</strong> Pix e Cartão de Crédito até 12x ativos.</li>
                      <li>✔ <strong>PayPal:</strong> Checkout internacional ativo.</li>
                    </ul>
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"
                  onClick={() => setModalIntegration(null)}
                >
                  Fechar
                </button>
                {modalIntegration !== 'meta' && modalIntegration !== 'gateways' && (
                  <button
                    type="submit"
                    className="rounded-lg bg-blue-600 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-blue-700"
                  >
                    Salvar Configurações
                  </button>
                )}
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

import { Calendar, CreditCard, Database, Mail, MessageCircle, Send, Workflow, type LucideIcon } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { FormField, Notice, ToggleRow } from '../../components/ui/Form'
import { Sheet } from '../../components/ui/Sheet'
import { StatusBadge } from '../../components/ui/StatusBadge'
import type { ConnectionState } from '../../lib/connection'
import { ApiError, listChannels } from '../../lib/crm'
import { disconnectGoogleIntegration, getGoogleAuthUrl, getGoogleIntegrationStatus } from '../../lib/googleCalendar'
import { connectErp, disconnectErp, getErpStatus, type ErpStatus } from '../../lib/integrations'
import { getMailAccount } from '../../lib/mail'
import { getMessageriaStatus, type MessageriaStatus } from '../../lib/messageria'
import { useNavigation } from '../../lib/navigationContext'
import { buttonClass } from '../../lib/ui'
import { describeWhatsAppConnection } from '../../lib/whatsappConnection'
import type { Page } from '../../types'
import { SettingsFrame } from './SettingsFrame'

type Kind = 'channel' | 'integration'
type Filter = 'all' | Kind

type Item = {
  id: string
  kind: Kind
  name: string
  description: string
  icon: LucideIcon
  state: ConnectionState | null
  /** Texto do selo quando o estado padrão não diz o suficiente. */
  stateLabel?: string
  onOpen?: () => void
}

/**
 * Central de integrações: um catálogo só, com estado real de cada conexão.
 *
 * O que estava aqui gravava chave de API do ERP, do n8n e token da Twilio no
 * `localStorage` do navegador — legível por qualquer script da página — e
 * mostrava "Ativo" para o n8n sempre (`!!chave || true`) e para três gateways
 * de pagamento que o servidor nunca teve. Agora cada estado vem do servidor, e
 * segredo só sobe: fica cifrado lá e nunca volta para a tela.
 */
export default function IntegrationCenterPage() {
  const { navigate } = useNavigation()
  const [filter, setFilter] = useState<Filter>('all')
  const [messageria, setMessageria] = useState<MessageriaStatus | null>(null)
  const [whatsapp, setWhatsapp] = useState<ConnectionState | null>(null)
  const [mail, setMail] = useState<ConnectionState | null>(null)
  const [erp, setErp] = useState<ErpStatus | null>(null)
  const [google, setGoogle] = useState<{ connected: boolean; email?: string } | null>(null)
  const [erpOpen, setErpOpen] = useState(false)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((value) => value + 1)

  useEffect(() => {
    let active = true
    Promise.allSettled([getMessageriaStatus(), listChannels(), getErpStatus(), getGoogleIntegrationStatus(), getMailAccount()]).then(
      ([status, channels, erpStatus, googleStatus, mailAccount]) => {
        if (!active) return
        const messageriaStatus = status.status === 'fulfilled' ? status.value : null
        setMessageria(messageriaStatus)
        setWhatsapp(describeWhatsAppConnection(messageriaStatus, channels.status === 'fulfilled' ? channels.value.channels : []).state)
        setErp(erpStatus.status === 'fulfilled' ? erpStatus.value : null)
        setGoogle(googleStatus.status === 'fulfilled' ? googleStatus.value : null)
        setMail(mailAccount.status === 'fulfilled' ? (!mailAccount.value.account ? 'disconnected' : mailAccount.value.account.lastError ? 'error' : 'connected') : null)
      },
    )
    return () => {
      active = false
    }
  }, [version])

  async function connectGoogle() {
    setFeedback(null)
    try {
      const { url } = await getGoogleAuthUrl()
      window.location.href = url
    } catch (error) {
      setFeedback({
        tone: error instanceof ApiError && error.code === 'google_not_configured' ? 'warning' : 'danger',
        text: error instanceof Error ? error.message : 'Não foi possível abrir o Google.',
      })
    }
  }

  async function toggleGoogle() {
    if (!google?.connected) return connectGoogle()
    if (!window.confirm('Desconectar o Google Agenda? As tarefas deixam de ir para a agenda.')) return
    try {
      await disconnectGoogleIntegration()
      setFeedback({ tone: 'success', text: 'Google Agenda desconectado.' })
      reload()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível desconectar.' })
    }
  }

  const go = (page: Page) => () => navigate(page)
  const messageriaState: ConnectionState | null = messageria === null ? null : !messageria.connected ? 'disconnected' : messageria.erro ? 'error' : 'connected'

  const items: Item[] = [
    { id: 'whatsapp', kind: 'channel', name: 'WhatsApp', description: 'Conversas com clientes pela conexão oficial', icon: MessageCircle, state: whatsapp, onOpen: go('whatsapp-channel') },
    { id: 'email', kind: 'channel', name: 'E-mail', description: 'Caixa de entrada e envio da newsletter', icon: Mail, state: mail, onOpen: go('mail-settings') },
    {
      id: 'messageria',
      kind: 'integration',
      name: 'Messageria Ávila Ops',
      description: 'Quem entrega o WhatsApp: janela de 24h, modelos e custo',
      icon: Send,
      state: messageriaState,
      onOpen: go('whatsapp-channel'),
    },
    {
      id: 'erp',
      kind: 'integration',
      name: 'ERP Ávila Ops',
      description: 'Clientes, pedidos e pagamentos na linha do tempo do contato',
      icon: Database,
      state: erp === null ? null : erp.connected ? 'connected' : 'disconnected',
      onOpen: () => setErpOpen(true),
    },
    {
      id: 'google',
      kind: 'integration',
      name: 'Google Agenda',
      description: google?.connected && google.email ? `Tarefas na agenda de ${google.email}` : 'Tarefas e reuniões na sua agenda do Google',
      icon: Calendar,
      state: google === null ? null : google.connected ? 'connected' : 'disconnected',
      onOpen: () => void toggleGoogle(),
    },
    {
      id: 'n8n',
      kind: 'integration',
      name: 'n8n',
      description: 'Cada automação chama o seu fluxo do n8n por webhook',
      icon: Workflow,
      state: 'disconnected',
      stateLabel: 'Por automação',
      onOpen: go('automations'),
    },
    {
      id: 'pagamentos',
      kind: 'integration',
      name: 'Pagamentos',
      description: 'Link de pagamento na conversa e status no negócio (Mercado Pago, Pix)',
      icon: CreditCard,
      state: 'soon',
    },
  ]

  const visible = items.filter((item) => filter === 'all' || item.kind === filter)
  const filters: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Todas' },
    { id: 'channel', label: 'Canais' },
    { id: 'integration', label: 'Integrações' },
  ]

  return (
    <SettingsFrame page="integrations" title="Integrações" description="Canais trazem conversas; integrações trocam dados com outros sistemas da empresa.">
      <div className="space-y-4">
        <div className="scroll-chips -mx-4 flex gap-2 px-4" role="group" aria-label="Filtrar">
          {filters.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={filter === option.id}
              onClick={() => setFilter(option.id)}
              className={`inline-flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-medium ${
                filter === option.id ? 'border-blue-600 bg-blue-50 text-blue-700' : 'border-slate-200 bg-white text-slate-600'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>

        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

        <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
          {visible.map((item) => {
            const Icon = item.icon
            const content = (
              <>
                <span className="grid size-10 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-700">
                  <Icon size={20} aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium text-slate-900">{item.name}</span>
                  <span className="block text-sm leading-snug text-slate-500">{item.description}</span>
                </span>
                {item.state ? <StatusBadge state={item.state} label={item.stateLabel} /> : <span className="text-xs text-slate-400">…</span>}
              </>
            )
            return (
              <li key={item.id}>
                {item.onOpen ? (
                  <button type="button" onClick={item.onOpen} className="flex min-h-16 w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-slate-50">
                    {content}
                  </button>
                ) : (
                  <div className="flex min-h-16 items-center gap-3 px-4 py-3">{content}</div>
                )}
              </li>
            )
          })}
        </ul>
      </div>

      <ErpSheet
        open={erpOpen}
        status={erp}
        onClose={() => setErpOpen(false)}
        onChanged={(text) => {
          setFeedback({ tone: 'success', text })
          setErpOpen(false)
          reload()
        }}
      />
    </SettingsFrame>
  )
}

function ErpSheet({ open, status, onClose, onChanged }: { open: boolean; status: ErpStatus | null; onClose: () => void; onChanged: (message: string) => void }) {
  const [form, setForm] = useState({ baseUrl: 'https://erp.avilaops.com', apiKey: '', webhookSecret: '', erpTenantId: '', createMissingContacts: true, autoWinLeadOnOrder: false })
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const webhookUrl = `${window.location.origin}/api/integrations/erp/webhook`

  async function submit(event: FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError('')
    try {
      await connectErp({
        baseUrl: form.baseUrl.trim(),
        apiKey: form.apiKey.trim(),
        webhookSecret: form.webhookSecret.trim(),
        erpTenantId: form.erpTenantId.trim(),
        settings: { createMissingContacts: form.createMissingContacts, autoWinLeadOnOrder: form.autoWinLeadOnOrder },
      })
      setForm((current) => ({ ...current, apiKey: '', webhookSecret: '' }))
      onChanged('ERP conectado.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível conectar o ERP.')
    } finally {
      setBusy(false)
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar o ERP? Os vínculos com os contatos ficam guardados para quando reconectar.')) return
    setBusy(true)
    try {
      await disconnectErp()
      onChanged('ERP desconectado.')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível desconectar.')
    } finally {
      setBusy(false)
    }
  }

  const connected = Boolean(status?.connected)

  return (
    <Sheet open={open} onClose={onClose} title="ERP Ávila Ops" description="Cliente, pedido e pagamento do ERP aparecem na linha do tempo do contato.">
      <div className="space-y-4 text-sm text-slate-700">
        {error && <Notice tone="danger">{error}</Notice>}
        {connected && status ? (
          <>
            <dl className="grid gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Endereço</dt>
                <dd className="break-all font-medium text-slate-900">{status.baseUrl}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Eventos esperando processamento</dt>
                <dd className="font-medium text-slate-900">{status.pendingEvents}</dd>
              </div>
              {Object.entries(status.links).map(([entity, total]) => (
                <div key={entity} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">Vínculos de {entity}</dt>
                  <dd className="font-medium text-slate-900">{total}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className={buttonClass.danger} disabled={busy} onClick={disconnect}>
              {busy ? 'Desconectando…' : 'Desconectar o ERP'}
            </button>
          </>
        ) : (
          <form onSubmit={submit} className="grid gap-4">
            <p>
              Gere uma chave de API e a assinatura de webhook no ERP, em Integrações › Chaves. No ERP, cadastre este endereço de entrega:
            </p>
            <code className="block break-all rounded-lg bg-slate-100 px-3 py-2 font-mono text-xs text-slate-800">{webhookUrl}</code>
            <FormField label="Endereço do ERP">
              <input className="input" type="url" inputMode="url" autoCapitalize="none" required value={form.baseUrl} onChange={(event) => setForm({ ...form, baseUrl: event.target.value })} />
            </FormField>
            <FormField label="Chave de API">
              <input className="input font-mono" type="password" autoComplete="off" spellCheck={false} required minLength={10} value={form.apiKey} onChange={(event) => setForm({ ...form, apiKey: event.target.value })} />
            </FormField>
            <FormField label="Segredo da assinatura de webhook">
              <input className="input font-mono" type="password" autoComplete="off" spellCheck={false} required minLength={10} value={form.webhookSecret} onChange={(event) => setForm({ ...form, webhookSecret: event.target.value })} />
            </FormField>
            <FormField label="ID da conta no ERP" hint="O identificador (UUID) da empresa no ERP.">
              <input
                className="input font-mono"
                autoCapitalize="none"
                spellCheck={false}
                required
                pattern="[0-9a-fA-F-]{36}"
                value={form.erpTenantId}
                onChange={(event) => setForm({ ...form, erpTenantId: event.target.value })}
              />
            </FormField>
            <ToggleRow
              checked={form.createMissingContacts}
              onChange={(createMissingContacts) => setForm({ ...form, createMissingContacts })}
              title="Criar contato quando o ERP mandar um cliente novo"
            />
            <ToggleRow
              checked={form.autoWinLeadOnOrder}
              onChange={(autoWinLeadOnOrder) => setForm({ ...form, autoWinLeadOnOrder })}
              title="Fechar o negócio quando o pedido for confirmado"
              description="Desligado por padrão: nem todo pedido nasce de um negócio do funil."
            />
            <p className="text-xs text-slate-500">A chave e o segredo ficam cifrados no servidor e não voltam para o navegador.</p>
            <div>
              <button type="submit" className={buttonClass.primary} disabled={busy}>
                {busy ? 'Conectando…' : 'Conectar o ERP'}
              </button>
            </div>
          </form>
        )}
      </div>
    </Sheet>
  )
}

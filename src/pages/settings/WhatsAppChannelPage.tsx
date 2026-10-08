import { CheckCircle2, ChevronDown, ExternalLink, MessageCircle, Phone, RefreshCw, ShieldCheck } from 'lucide-react'
import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Sheet } from '../../components/ui/Sheet'
import { FormField, Notice } from '../../components/ui/Form'
import { StatusBadge, ToneBadge } from '../../components/ui/StatusBadge'
import { CostSimulator, PriceSummary, PriceTable } from '../../components/whatsapp/Pricing'
import { tabelaVigente } from '../../data/whatsappPricing'
import { listChannels, type CrmChannel } from '../../lib/crm'
import { disconnectMeta, getMetaStatus, MetaError, sincronizarMeta, type MetaPrevia, type MetaStatus } from '../../lib/meta'
import { connectMessageria, disconnectMessageria, getMessageriaStatus, type MessageriaStatus } from '../../lib/messageria'
import { useNavigation } from '../../lib/navigationContext'
import { useSession } from '../../lib/session'
import { supportLinks } from '../../lib/support'
import { buttonClass } from '../../lib/ui'
import { describeWhatsAppConnection, type WhatsAppConnectionView } from '../../lib/whatsappConnection'
import type { Page } from '../../types'
import { SettingsFrame } from './SettingsFrame'

/**
 * A Coexistência — manter o número no app WhatsApp Business do celular e usar
 * o CRM ao mesmo tempo — depende de a Ávila Ops ser Tech Provider aprovada pela
 * Meta. Enquanto não for, a tela mostra o caminho como "em breve" em vez de
 * prometer algo que a conexão de hoje não entrega. Virar `true` é uma linha.
 */
const COEXISTENCIA_DISPONIVEL = false

/**
 * Canais › WhatsApp.
 *
 * Um botão principal, uma explicação em três passos, o que muda no celular e
 * quanto custa — nessa ordem. O QR Code de "teste em dois passos" que ficava ao
 * lado do "+ Instalar" saiu: era uma conexão pelo WhatsApp Web, caminho que a
 * Meta não permite, e quando o serviço por trás não respondia ele desenhava um
 * QR falso. No celular, ainda pedia para escanear a própria tela.
 */
export function WhatsAppChannelPage() {
  const { canManage } = useSession()
  const [messageria, setMessageria] = useState<MessageriaStatus | null>(null)
  const [channels, setChannels] = useState<CrmChannel[]>([])
  const [meta, setMeta] = useState<MetaStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [connectOpen, setConnectOpen] = useState(false)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((value) => value + 1)

  useEffect(() => {
    let active = true
    setLoading(true)
    Promise.allSettled([getMessageriaStatus(), listChannels(), getMetaStatus()]).then(([status, channelList, metaStatus]) => {
      if (!active) return
      setMessageria(status.status === 'fulfilled' ? status.value : null)
      setChannels(channelList.status === 'fulfilled' ? channelList.value.channels : [])
      setMeta(metaStatus.status === 'fulfilled' ? metaStatus.value : null)
      setLoadError(status.status === 'rejected' ? 'Não foi possível consultar a conexão agora.' : '')
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [version])

  const view = describeWhatsAppConnection(messageria, channels)
  const tabela = tabelaVigente()

  return (
    <SettingsFrame page="whatsapp-channel" title="WhatsApp" wide>
      <div className="@container">
        {/* No celular a ordem é: conexão, como funciona, o que muda, preço e,
            por último, a configuração avançada. Lado a lado, o preço vira a
            coluna da direita e acompanha a rolagem. */}
        <div className="grid gap-5 @3xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] @3xl:items-start">
          <div className="grid min-w-0 gap-5 @3xl:col-start-1 @3xl:row-start-1">
            {loading ? (
              <section className="rounded-xl border border-slate-200 bg-white p-5 text-sm text-slate-500">Consultando a conexão…</section>
            ) : (
              <StatusCard view={view} loadError={loadError} onConnect={() => setConnectOpen(true)} onRetry={reload} />
            )}
            {view.unofficial.length > 0 && <UnofficialWarning view={view} />}
            <HowItWorks />
            <WhatChanges />
          </div>

          <aside className="min-w-0 @3xl:sticky @3xl:top-24 @3xl:col-start-2 @3xl:row-span-2 @3xl:row-start-1" aria-labelledby="preco-titulo">
            <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-4 medium:p-5">
              <h2 id="preco-titulo" className="text-base font-semibold text-slate-900">Quanto custa</h2>
              <PriceSummary tabela={tabela} />
              <PriceTable tabela={tabela} />
              <CostSimulator tabela={tabela} numeros={Math.max(1, view.numbers.filter((number) => !number.isTest).length)} />
            </section>
          </aside>

          {canManage && (
            <div className="min-w-0 @3xl:col-start-1 @3xl:row-start-2">
              <AdvancedSettings messageria={messageria} view={view} meta={meta} onChanged={reload} />
            </div>
          )}
        </div>
      </div>

      <ConnectSheet open={connectOpen} onClose={() => setConnectOpen(false)} />
    </SettingsFrame>
  )
}

function StatusCard({
  view,
  loadError,
  onConnect,
  onRetry,
}: {
  view: WhatsAppConnectionView
  loadError: string
  onConnect: () => void
  onRetry: () => void
}) {
  const { navigate } = useNavigation()

  if (view.state === 'disconnected') {
    return (
      <section className="rounded-xl border border-slate-200 bg-white p-5 medium:p-6">
        <span className="grid size-12 place-items-center rounded-2xl bg-emerald-100 text-emerald-700">
          <MessageCircle size={24} aria-hidden="true" />
        </span>
        <h2 className="mt-4 text-xl font-semibold text-slate-900">Conecte o WhatsApp da sua empresa</h2>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          Receba e responda seus clientes aqui, pela conexão oficial da Meta — sem o risco de bloqueio dos aplicativos não autorizados.
        </p>
        {loadError && <div className="mt-4"><Notice tone="warning">{loadError}</Notice></div>}
        <button type="button" className={`${buttonClass.primary} mt-5 min-h-12 w-full text-base medium:w-auto medium:px-6`} onClick={onConnect}>
          Conectar meu WhatsApp Business
        </button>
      </section>
    )
  }

  const nextSteps: { label: string; page: Page }[] = [
    { label: 'Defina quem atende as conversas', page: 'users' },
    { label: 'Escreva a mensagem de boas-vindas', page: 'chat-settings' },
    { label: 'Mande um “oi” do seu celular para o número e veja chegar na Caixa de entrada', page: 'chat-inbox' },
  ]

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 medium:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{view.state === 'connected' ? 'WhatsApp conectado' : 'WhatsApp com pendência'}</h2>
        <StatusBadge state={view.state} />
      </div>
      {view.reason && (
        <div className="mt-4">
          <Notice
            tone={view.state === 'error' ? 'danger' : 'warning'}
            action={
              <button type="button" className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold hover:bg-black/5" onClick={onRetry}>
                <RefreshCw size={15} aria-hidden="true" />
                Tentar de novo
              </button>
            }
          >
            {view.reason}
          </Notice>
        </div>
      )}
      {view.numbers.length > 0 && (
        <ul className="mt-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
          {view.numbers.map((number) => (
            <li key={number.id} className="flex flex-wrap items-center gap-2 px-3 py-2.5">
              <Phone size={16} className="text-slate-500" aria-hidden="true" />
              <span className="font-medium tabular-nums text-slate-900">{number.label}</span>
              {number.isDefault && <ToneBadge tone="info">Padrão</ToneBadge>}
              {number.isTest && <ToneBadge tone="warning">Teste da Meta</ToneBadge>}
            </li>
          ))}
        </ul>
      )}
      {view.state === 'connected' && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold text-slate-900">Próximos passos</h3>
          <ol className="mt-2 space-y-1">
            {nextSteps.map((step, index) => (
              <li key={step.label}>
                <button
                  type="button"
                  onClick={() => navigate(step.page)}
                  className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 text-left text-sm text-slate-700 hover:bg-slate-50"
                >
                  <span className="grid size-6 shrink-0 place-items-center rounded-full bg-blue-50 text-xs font-bold text-blue-700">{index + 1}</span>
                  {step.label}
                </button>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

function UnofficialWarning({ view }: { view: WhatsAppConnectionView }) {
  return (
    <Notice tone="warning">
      <p className="font-semibold">Conexão por QR Code encontrada</p>
      <p className="mt-1">
        Ligar o WhatsApp pelo QR Code (WhatsApp Web) é um caminho que a Meta não permite e pode levar ao bloqueio do número. O CRM não cria
        mais conexões assim; use a conexão oficial.
      </p>
      <ul className="mt-2 list-disc pl-5">
        {view.unofficial.map((item) => (
          <li key={item.id}>
            {item.label}
            {item.neverCompleted ? ' — a leitura do QR nunca foi concluída' : ''}
          </li>
        ))}
      </ul>
    </Notice>
  )
}

function HowItWorks() {
  const paths = [
    {
      title: 'Um número só para o CRM',
      badge: <ToneBadge tone="success">Disponível</ToneBadge>,
      text: 'Um número novo, ou um que você libera do app, passa a atender pelo CRM — no computador ou no celular, pelo navegador.',
    },
    {
      title: 'Seu número de hoje, sem largar o app',
      badge: COEXISTENCIA_DISPONIVEL ? <ToneBadge tone="success">Disponível</ToneBadge> : <ToneBadge tone="neutral">Em breve</ToneBadge>,
      text: 'O WhatsApp Business continua no seu celular, e os contatos e as conversas dos últimos 6 meses chegam ao CRM.',
    },
  ]
  const steps = [
    'Você chama a equipe Ávila Ops e combina um horário. A conexão leva uns 15 minutos.',
    'Na chamada, você entra com o Facebook da empresa e confirma o número com o código que chega por SMS ou ligação.',
    'Pronto: as mensagens dos clientes chegam na Caixa de entrada, com o prazo de resposta à vista.',
  ]
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5 medium:p-6" aria-labelledby="como-titulo">
      <h2 id="como-titulo" className="text-base font-semibold text-slate-900">Duas formas de conectar</h2>
      <ul className="mt-3 grid gap-3 medium:grid-cols-2">
        {paths.map((path) => (
          <li key={path.title} className="rounded-lg border border-slate-200 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-medium text-slate-900">{path.title}</p>
              {path.badge}
            </div>
            <p className="mt-1 text-sm leading-snug text-slate-600">{path.text}</p>
          </li>
        ))}
      </ul>
      <h3 className="mt-5 text-sm font-semibold text-slate-900">O que acontece</h3>
      <ol className="mt-2 space-y-3">
        {steps.map((step, index) => (
          <li key={step} className="flex gap-3 text-sm leading-relaxed text-slate-700">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-slate-900 text-xs font-bold text-white">{index + 1}</span>
            {step}
          </li>
        ))}
      </ol>
    </section>
  )
}

function Disclosure({ title, children, defaultOpen = false }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details className="group rounded-xl border border-slate-200 bg-white" open={defaultOpen}>
      <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-5 font-semibold text-slate-900 medium:px-6 [&::-webkit-details-marker]:hidden">
        {title}
        <ChevronDown size={18} className="shrink-0 text-slate-500 transition group-open:rotate-180" aria-hidden="true" />
      </summary>
      <div className="border-t border-slate-100 px-5 py-4 medium:px-6">{children}</div>
    </details>
  )
}

function WhatChanges() {
  const coexistencia = [
    'As conversas individuais dos últimos 6 meses podem vir para o CRM. Grupos, não.',
    'As listas de transmissão do app ficam desativadas (as que existem ficam só para leitura). Envio em massa passa a ser pelo CRM, com modelos aprovados pela Meta.',
    'Mensagens temporárias, de visualização única e a localização em tempo real são desativadas nas conversas individuais.',
    'Os aparelhos conectados são desvinculados e podem ser ligados de novo — menos o WhatsApp para Windows e o WearOS.',
    'O que você manda pelo app no celular continua grátis. O que sai pelo CRM segue a tabela da Meta.',
    'O número atende até 20 mensagens por segundo.',
    'Para desconectar, no app: Configurações › Conta › Business Platform › Desconectar.',
  ]
  return (
    <Disclosure title="O que muda no seu celular">
      <div className="space-y-4 text-sm leading-relaxed text-slate-700">
        <div>
          <p className="font-semibold text-slate-900">Com um número só para o CRM</p>
          <p className="mt-1">
            O número deixa de funcionar no app WhatsApp do celular: o atendimento passa todo para o CRM. Se hoje esse número é o seu
            WhatsApp de trabalho, combine na chamada qual número usar.
          </p>
        </div>
        <div>
          <p className="font-semibold text-slate-900">
            Mantendo o app no celular {!COEXISTENCIA_DISPONIVEL && <span className="font-normal text-slate-500">(em breve)</span>}
          </p>
          <ul className="mt-1 list-disc space-y-1 pl-5">
            {coexistencia.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
      </div>
    </Disclosure>
  )
}

function ConnectSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { user } = useSession()
  const links = supportLinks(
    `Olá! Quero conectar o WhatsApp da minha empresa ao Agenda CRM. Sou ${user.name} (${user.email}).`,
    'Conectar o WhatsApp ao Agenda CRM',
  )
  const hasContact = Boolean(links.whatsapp || links.email)

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="Conectar o WhatsApp Business"
      description="A conexão oficial é feita com a equipe Ávila Ops, numa chamada de uns 15 minutos."
      footer={
        hasContact ? (
          <div className="grid gap-2 medium:flex medium:justify-end">
            {links.email && (
              <a className={buttonClass.secondary} href={links.email}>
                Enviar por e-mail
              </a>
            )}
            {links.whatsapp && (
              <a className={buttonClass.primary} href={links.whatsapp} target="_blank" rel="noreferrer">
                Chamar a Ávila Ops no WhatsApp
              </a>
            )}
          </div>
        ) : undefined
      }
    >
      <div className="space-y-4 text-[15px] leading-relaxed text-slate-700">
        <p className="font-semibold text-slate-900">Antes da chamada, separe:</p>
        <ul className="space-y-3">
          {[
            'O celular com o número que vai atender os clientes.',
            'O login no Facebook de quem administra a empresa no Gerenciador de Negócios da Meta. Se ainda não existir, criamos juntos.',
            'Quem vai atender: dá para convidar a equipe logo depois, em Usuários e equipes.',
          ].map((item) => (
            <li key={item} className="flex gap-3">
              <CheckCircle2 size={20} className="mt-0.5 shrink-0 text-emerald-600" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
        <p className="flex gap-3 rounded-lg bg-slate-50 p-3 text-sm text-slate-600">
          <ShieldCheck size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
          A conexão é a oficial da Meta. O CRM nunca pede para escanear QR Code nem guarda a senha do seu WhatsApp.
        </p>
        {!hasContact && <Notice tone="info">Peça a quem administra a sua conta Ávila Ops para agendar a conexão.</Notice>}
      </div>
    </Sheet>
  )
}

/**
 * Configuração avançada, para quem administra: ligar o CRM à Messageria com a
 * chave da conta. As rotas existiam sem tela — conectar exigia `curl`.
 */
function AdvancedSettings({
  messageria,
  view,
  meta,
  onChanged,
}: {
  messageria: MessageriaStatus | null
  view: WhatsAppConnectionView
  meta: MetaStatus | null
  onChanged: () => void
}) {
  const [apiKey, setApiKey] = useState('')
  const [baseUrl, setBaseUrl] = useState('')
  const [busy, setBusy] = useState<'' | 'connect' | 'disconnect'>('')
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger'; text: string } | null>(null)
  const connected = Boolean(messageria?.connected)

  async function connect(event: FormEvent) {
    event.preventDefault()
    setBusy('connect')
    setFeedback(null)
    try {
      const result = await connectMessageria({ apiKey: apiKey.trim(), baseUrl: baseUrl.trim() || undefined })
      setApiKey('')
      setFeedback({ tone: 'success', text: `Conectado. ${result.canais.length} número(s) encontrado(s) e recebimento registrado.` })
      onChanged()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível conectar.' })
    } finally {
      setBusy('')
    }
  }

  async function disconnect() {
    if (!window.confirm('Desconectar a Messageria? O CRM para de enviar e receber WhatsApp até conectar de novo.')) return
    setBusy('disconnect')
    setFeedback(null)
    try {
      await disconnectMessageria()
      setFeedback({ tone: 'success', text: 'Messageria desconectada.' })
      onChanged()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível desconectar.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <Disclosure title="Configuração avançada">
      <div className="space-y-4 text-sm text-slate-700">
        <p>
          Quem fala com a Meta é a Messageria (sms.avilaops.com): ela entrega, controla a janela de 24 horas e os modelos aprovados. O CRM se
          liga a ela com a chave da conta, que fica cifrada no servidor e não volta para o navegador.
        </p>
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

        {connected && messageria?.connected ? (
          <div className="space-y-3">
            <dl className="grid gap-2 rounded-lg border border-slate-200 p-3">
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Endereço</dt>
                <dd className="break-all font-medium text-slate-900">{messageria.baseUrl}</dd>
              </div>
              <div className="flex flex-wrap justify-between gap-2">
                <dt className="text-slate-500">Recebimento das respostas</dt>
                <dd className="font-medium text-slate-900">{messageria.assinaturaRegistrada === false ? 'Não registrado' : 'Registrado'}</dd>
              </div>
              {view.numbers.map((number) => (
                <div key={number.id} className="flex flex-wrap justify-between gap-2">
                  <dt className="text-slate-500">{number.label}</dt>
                  <dd className="break-all font-mono text-xs text-slate-700">{number.id}</dd>
                </div>
              ))}
            </dl>
            <button type="button" className={buttonClass.danger} disabled={busy !== ''} onClick={disconnect}>
              {busy === 'disconnect' ? 'Desconectando…' : 'Desconectar a Messageria'}
            </button>
          </div>
        ) : (
          <form onSubmit={connect} className="grid gap-4">
            <FormField label="Chave da Messageria" hint="Começa com sk_live_. Pegue no painel da Messageria, em Chaves de API.">
              <input
                className="input font-mono"
                type="password"
                autoComplete="off"
                spellCheck={false}
                placeholder="sk_live_…"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                minLength={10}
                required
              />
            </FormField>
            <FormField label="Endereço da Messageria" hint="Deixe em branco para usar https://sms.avilaops.com.">
              <input
                className="input"
                type="url"
                inputMode="url"
                autoCapitalize="none"
                placeholder="https://sms.avilaops.com"
                value={baseUrl}
                onChange={(event) => setBaseUrl(event.target.value)}
              />
            </FormField>
            <div>
              <button type="submit" className={buttonClass.primary} disabled={busy !== '' || apiKey.trim().length < 10}>
                {busy === 'connect' ? 'Conectando…' : 'Conectar à Messageria'}
              </button>
            </div>
          </form>
        )}

        <MetaAccount meta={meta} onChanged={onChanged} />
      </div>
    </Disclosure>
  )
}

const dataCurta = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/**
 * Conta da Meta da empresa.
 *
 * A pessoa conecta o Facebook na conta Ávila Ops, em outra aba, e volta para
 * trazer a conexão. O CRM não pede App ID, segredo nem token: esse formulário
 * existia só por `curl` e foi aposentado.
 */
function MetaAccount({ meta, onChanged }: { meta: MetaStatus | null; onChanged: () => void }) {
  const [busy, setBusy] = useState<'' | 'sync' | 'disconnect'>('')
  const [preview, setPreview] = useState<MetaPrevia | null>(null)
  const [feedback, setFeedback] = useState<{ tone: 'success' | 'danger' | 'warning'; text: string } | null>(null)
  const page = meta?.paginaDaMeta ?? 'https://auth.avilaops.com/conta/meta'
  const fromAccount = meta?.origem === 'auth'

  async function sync(confirmar: boolean) {
    setBusy('sync')
    setFeedback(null)
    try {
      const result = await sincronizarMeta(confirmar)
      if (result.previa) {
        setPreview(result)
        return
      }
      setPreview(null)
      const total = result.numeros ?? 0
      setFeedback({
        tone: 'success',
        text: total > 0 ? `Conta da Meta atualizada. ${total} número(s) de WhatsApp encontrado(s).` : 'Conta da Meta atualizada. Ela ainda não tem número de WhatsApp.',
      })
      onChanged()
    } catch (error) {
      const code = error instanceof MetaError ? error.code : null
      const text = error instanceof Error ? error.message : 'Não foi possível consultar a conta da Meta.'
      // Não conectou ou venceu: não é falha, é o próximo passo da pessoa.
      setFeedback({ tone: code === 'nao_conectada' || code === 'vencida' || code === 'sso_obrigatorio' ? 'warning' : 'danger', text })
    } finally {
      setBusy('')
    }
  }

  async function disconnect() {
    if (!window.confirm('Tirar a conta da Meta desta empresa? A conexão continua guardada na sua conta Ávila Ops.')) return
    setBusy('disconnect')
    setFeedback(null)
    try {
      await disconnectMeta()
      setPreview(null)
      setFeedback({ tone: 'success', text: 'Conta da Meta retirada desta empresa.' })
      onChanged()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível desconectar.' })
    } finally {
      setBusy('')
    }
  }

  return (
    <section className="space-y-3 border-t border-slate-100 pt-4" aria-labelledby="conta-meta-titulo">
      <h3 id="conta-meta-titulo" className="font-semibold text-slate-900">Conta da Meta</h3>
      <p>
        O Facebook da empresa é conectado uma vez só, na sua conta Ávila Ops, e vale para os sistemas da casa. Aqui o CRM lê essa conexão para
        encontrar os números de WhatsApp. As respostas dos clientes continuam chegando pela Messageria.
      </p>
      {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

      {meta?.pendencia && (
        <Notice tone="warning">
          {meta.pendencia === 'vencida'
            ? 'A conexão com a Meta venceu. Conecte de novo na conta Ávila Ops e depois atualize aqui.'
            : 'A conta da Meta foi desconectada na conta Ávila Ops. Conecte de novo lá e depois atualize aqui.'}
        </Notice>
      )}

      {meta?.connected && (
        <dl className="grid gap-2 rounded-lg border border-slate-200 p-3">
          <div className="flex flex-wrap justify-between gap-2">
            <dt className="text-slate-500">Conectada como</dt>
            <dd className="font-medium text-slate-900">{meta.userName ?? 'Conta da Meta'}</dd>
          </div>
          {meta.conta && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Conta Ávila Ops</dt>
              <dd className="break-all font-medium text-slate-900">{meta.conta}</dd>
            </div>
          )}
          {meta.tokenExpiresAt && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Válida até</dt>
              <dd className="font-medium tabular-nums text-slate-900">{dataCurta.format(new Date(meta.tokenExpiresAt))}</dd>
            </div>
          )}
          {meta.numeros !== null && (
            <div className="flex flex-wrap justify-between gap-2">
              <dt className="text-slate-500">Números de WhatsApp</dt>
              <dd className="font-medium tabular-nums text-slate-900">{meta.numeros}</dd>
            </div>
          )}
        </dl>
      )}

      {meta?.origem === 'direta' && (
        <Notice tone="neutral">
          Esta conexão foi feita pelo caminho antigo, direto pelo CRM. Ao trazer a conta da Meta da Ávila Ops, ela passa a ser a usada.
        </Notice>
      )}

      {preview && (
        <div className="space-y-3 rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="font-semibold text-slate-900">Usar esta conta da Meta nesta empresa?</p>
          <p>
            {preview.nome ?? 'Conta da Meta'} ({preview.conta}).{' '}
            {preview.numeros.length > 0 ? `Números encontrados: ${preview.numeros.join(', ')}.` : 'Ela ainda não tem número de WhatsApp.'}
          </p>
          <div className="grid gap-2 medium:flex">
            <button type="button" className={buttonClass.primary} disabled={busy !== ''} onClick={() => sync(true)}>
              {busy === 'sync' ? 'Gravando…' : 'Usar esta conta'}
            </button>
            <button type="button" className={buttonClass.secondary} disabled={busy !== ''} onClick={() => setPreview(null)}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      {!preview && (
        <div className="grid gap-2 medium:flex medium:flex-wrap">
          <a className={fromAccount && !meta?.pendencia ? buttonClass.secondary : buttonClass.primary} href={page} target="_blank" rel="noreferrer">
            <ExternalLink size={16} aria-hidden="true" />
            {fromAccount ? 'Abrir na conta Ávila Ops' : 'Conectar na Ávila Ops'}
          </a>
          <button type="button" className={buttonClass.secondary} disabled={busy !== ''} onClick={() => sync(false)}>
            <RefreshCw size={16} aria-hidden="true" />
            {busy === 'sync' ? 'Consultando…' : fromAccount ? 'Atualizar' : 'Já conectei, trazer para cá'}
          </button>
          {meta?.connected && (
            <button type="button" className={buttonClass.danger} disabled={busy !== ''} onClick={disconnect}>
              {busy === 'disconnect' ? 'Retirando…' : 'Retirar desta empresa'}
            </button>
          )}
        </div>
      )}
    </section>
  )
}

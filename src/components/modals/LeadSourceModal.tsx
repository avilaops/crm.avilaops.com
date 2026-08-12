import { CheckCircle2, ChevronLeft, MessageCircle, X, Loader2 } from 'lucide-react'
import { useEffect, useState, type ComponentType } from 'react'
import { connectMeta, type MetaStatus } from '../../lib/meta'
import { getQrCodeInstance, getQrCodeStatus } from '../../lib/crm'

export type LeadSource = 'whatsapp' | 'instagram'
type Step = 'benefits' | 'install' | 'connect'

export function InstagramIcon({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
    </svg>
  )
}

const sourceConfig = {
  whatsapp: {
    label: 'WhatsApp Business',
    tagline: 'Mais leads com poderosas ferramentas do WhatsApp',
    icon: MessageCircle,
    brandBg: 'bg-emerald-950',
    iconBg: 'bg-emerald-100 text-emerald-600',
    benefits: [
      'Preço: Responda grátis ou inicie novas conversas a partir de $0,0002',
      'Risco de bloqueio do seu número: Baixo',
      'Continue a usar o WhatsApp Business no seu telefone',
      'Bots sem código com recursos avançados',
      'Formulários e cartões interativos e mais',
      'Transmissões em massa personalizadas',
      'Agente de IA que responde como humano',
      'Transforme o número em nome comercial',
    ],
    installTitle: 'Teste o WhatsApp Business em apenas dois passos',
    installSubtitle: 'Escaneie o QR code abaixo pelo aplicativo do WhatsApp do seu celular.',
    connectTitle: 'Conecte o WhatsApp à sua conta Agenda',
    connectBody: 'Vincule sua conta WhatsApp existente ou crie uma nova com um número de telefone. Para vários números, repita o processo por canal.',
    connectActions: ['Conectar via Meta API', 'Conectar via QR Code'],
  },
  instagram: {
    label: 'Instagram Direct',
    tagline: 'Capture e responda leads direto do Instagram',
    icon: InstagramIcon,
    brandBg: 'bg-gradient-to-tr from-amber-500 via-pink-600 to-purple-700',
    iconBg: 'bg-gradient-to-tr from-amber-400 via-pink-500 to-purple-600 text-white',
    benefits: [
      'Preço: Grátis para responder mensagens do Direct',
      'Comentários e stories viram leads automaticamente',
      'Respostas rápidas e menus interativos',
      'Bots sem código com recursos avançados',
      'Transmissões em massa personalizadas',
      'Agente de IA que responde como humano',
      'Conecte várias contas comerciais',
    ],
    installTitle: 'Conecte sua conta comercial do Instagram',
    installSubtitle: 'Entre com o Facebook para vincular seu perfil comercial em poucos passos.',
    connectTitle: 'Conecte o Instagram à sua conta Agenda',
    connectBody: 'Vincule sua conta comercial do Instagram existente para começar a capturar leads das mensagens diretas.',
    connectActions: ['Conectar minha conta', 'Conectar conta nova'],
  },
} satisfies Record<LeadSource, {
  label: string
  tagline: string
  icon: ComponentType<{ size?: number }>
  brandBg: string
  iconBg: string
  benefits: string[]
  installTitle: string
  installSubtitle: string
  connectTitle: string
  connectBody: string
  connectActions: [string, string]
}>

function LeadSourceModal({
  source,
  onClose,
  onConnected,
}: {
  source: LeadSource
  onClose: () => void
  onConnected: (status: MetaStatus) => void
}) {
  const [step, setStep] = useState<Step>('benefits')
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState('')
  const [qrcode, setQrcode] = useState<string | null>(null)
  const [qrStatus, setQrStatus] = useState<string>('connecting')
  const [instanceName, setInstanceName] = useState<string | null>(null)
  const config = sourceConfig[source]
  const Icon = config.icon

  useEffect(() => {
    if (step === 'install' && source === 'whatsapp') {
      getQrCodeInstance().then((data) => {
        setQrcode(data.qrcode)
        setQrStatus(data.status)
        setInstanceName(data.instanceName)
      }).catch(() => {})
    }
  }, [step, source])

  useEffect(() => {
    if (!instanceName || qrStatus === 'open') return
    const interval = setInterval(() => {
      getQrCodeStatus(instanceName).then((data) => {
        if (data.status) setQrStatus(data.status)
      }).catch(() => {})
    }, 3000)
    return () => clearInterval(interval)
  }, [instanceName, qrStatus])

  async function handleConnect() {
    setConnecting(true)
    setError('')
    try {
      const status = await connectMeta()
      onConnected(status)
      onClose()
    } catch (err) {
      setError(typeof err === 'string' ? err : 'Não foi possível concluir o login com a Meta.')
    } finally {
      setConnecting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-6">
      {step === 'benefits' && (
        <div className="w-full max-w-md rounded bg-white p-6 shadow-xl">
          <div className="mb-4 flex items-start justify-between">
            <h2 className="text-xl font-bold">Conheça seus benefícios do {config.label}</h2>
            <button onClick={onClose}><X size={18} /></button>
          </div>
          <div className="space-y-3 text-sm text-slate-700">
            {config.benefits.map((benefit) => (
              <p key={benefit} className="flex items-start gap-3">
                <CheckCircle2 className="mt-0.5 shrink-0 text-slate-400" size={16} />
                {benefit}
              </p>
            ))}
          </div>
          <button
            className="mt-6 w-full rounded bg-blue-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => setStep('install')}
          >
            Conectar {config.label}
          </button>
        </div>
      )}

      {step === 'install' && (
        <div className="grid w-full max-w-4xl grid-cols-[260px_minmax(0,1fr)] overflow-hidden rounded bg-white shadow-xl">
          <aside className="border-r border-slate-200 p-6">
            <button className="mb-4 flex items-center gap-1 text-sm text-slate-500" onClick={() => setStep('benefits')}>
              <ChevronLeft size={16} /> Voltar
            </button>
            <div className={`grid h-16 w-16 place-items-center rounded ${config.iconBg}`}>
              <Icon size={28} />
            </div>
            <h3 className="mt-4 font-semibold">{config.label}</h3>
            <p className="mt-1 text-sm text-slate-500">{config.tagline}</p>
            <span className="mt-4 inline-block rounded bg-blue-600 px-3 py-1.5 text-xs font-semibold text-white">+ Instalar</span>
          </aside>
          <section className={`relative p-10 text-white ${config.brandBg}`}>
            <button className="absolute right-4 top-4 text-white" onClick={onClose}><X size={18} /></button>
            <h2 className="max-w-sm text-2xl font-bold">{config.installTitle}</h2>
            <p className="mt-3 max-w-sm text-white/80">{config.installSubtitle}</p>
            
            <div className="mt-6 flex flex-col items-start gap-3">
              <div className="overflow-hidden rounded bg-white p-3 shadow-lg">
                {qrcode ? (
                  <img src={qrcode} alt="QR Code WhatsApp" className="h-44 w-44 object-contain" />
                ) : (
                  <div className="grid h-44 w-44 place-items-center text-slate-900">
                    <Loader2 className="animate-spin text-emerald-600" size={36} />
                  </div>
                )}
              </div>
              {source === 'whatsapp' && (
                <span className="rounded bg-emerald-500/20 px-3 py-1 text-xs font-semibold text-emerald-300">
                  {qrStatus === 'open' ? '✓ Dispositivo conectado!' : 'Aguardando leitura do QR Code...'}
                </span>
              )}
            </div>

            <button
              className="mt-6 rounded bg-white px-5 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-100 transition"
              onClick={() => setStep('connect')}
            >
              Opções Avançadas / Meta Cloud API
            </button>
          </section>
        </div>
      )}

      {step === 'connect' && (
        <div className="grid max-h-[90vh] w-full max-w-5xl grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded bg-white shadow-xl">
          <aside className="bg-slate-50 p-8">
            <div className={`grid h-32 place-items-center rounded text-xl font-bold text-white ${config.brandBg}`}>{config.label}</div>
            <h3 className="mt-5 text-2xl font-bold">{config.label}</h3>
            <p className="mt-2 text-sm text-slate-500">{config.tagline}</p>
            <span className="mt-5 inline-block rounded border border-emerald-500 px-4 py-2 text-emerald-600">Instalado</span>
          </aside>
          <section className="relative p-10">
            <button className="absolute right-4 top-4" onClick={onClose}><X size={18} /></button>
            <div className={`grid h-28 w-28 place-items-center rounded-full ${config.iconBg}`}><Icon size={48} /></div>
            <h2 className="mt-8 text-2xl">{config.connectTitle}</h2>
            <p className="mt-3 max-w-xl text-slate-500">{config.connectBody}</p>
            {error && <p className="mt-4 rounded border border-red-200 bg-red-50 px-4 py-2 text-sm text-red-600">{error}</p>}
            <div className="mt-8 flex gap-3">
              <button
                className="rounded bg-blue-600 px-5 py-2 text-sm font-semibold text-white disabled:opacity-60"
                onClick={handleConnect}
                disabled={connecting}
              >
                {connecting ? 'Abrindo login da Meta...' : config.connectActions[0]}
              </button>
              <button
                className="rounded border border-slate-200 px-5 py-2 text-sm font-semibold disabled:opacity-60"
                onClick={handleConnect}
                disabled={connecting}
              >
                {config.connectActions[1]}
              </button>
            </div>
            <div className="mt-8 flex items-center justify-between rounded border border-slate-200 p-4 text-sm text-slate-600">
              <span>Precisa de ajuda?</span>
              <span className="text-blue-600">Falar com o suporte</span>
            </div>
          </section>
        </div>
      )}
    </div>
  )
}

export default LeadSourceModal

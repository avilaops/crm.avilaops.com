import { ArrowRight, Bot, Inbox, Sparkles, UsersRound } from 'lucide-react'
import { useEffect, useState, type ReactNode } from 'react'
import { getSession, getSsoStatus, type SessionUser } from '../../lib/auth'
import AvilaMark from './AvilaMark'

type LandingProps = { onEnter: (user: SessionUser) => void }

const features: { icon: typeof Inbox; title: string; text: string }[] = [
  { icon: Inbox, title: 'Conversas em um só lugar', text: 'Organize atendimento, histórico e próximos passos sem alternar entre ferramentas.' },
  { icon: UsersRound, title: 'Relacionamentos que continuam', text: 'Tenha contexto de pessoas, empresas e oportunidades em cada contato.' },
  { icon: Bot, title: 'Automação com supervisão', text: 'Use IA para acelerar o trabalho, mantendo a decisão nas mãos da equipe.' },
]

function Feature({ icon: Icon, title, text }: (typeof features)[number]) {
  return (
    <article className="rounded-2xl border border-slate-200 bg-white/80 p-5 shadow-sm">
      <div className="mb-4 grid size-10 place-items-center rounded-xl bg-amber-100 text-amber-700">
        <Icon size={20} aria-hidden="true" />
      </div>
      <h2 className="text-base font-semibold text-slate-950">{title}</h2>
      <p className="mt-2 text-sm leading-6 text-slate-600">{text}</p>
    </article>
  )
}

function StatusMessage({ children }: { children: ReactNode }) {
  return <p className="mt-4 text-center text-sm text-slate-500" role="status">{children}</p>
}

export default function Landing({ onEnter }: LandingProps) {
  const [authUrl, setAuthUrl] = useState<string | null>(null)
  const [signupUrl, setSignupUrl] = useState<string | null>(null)
  const [checking, setChecking] = useState(true)

  useEffect(() => {
    let active = true
    getSession()
      .then((session) => {
        if (active && session.user) onEnter(session.user)
      })
      .catch(() => undefined)
      .finally(() => active && setChecking(false))
    getSsoStatus()
      .then((status) => {
        if (!active) return
        setAuthUrl(status.enabled ? status.url : null)
        setSignupUrl(status.enabled ? status.signupUrl : null)
      })
      .catch(() => {
        if (!active) return
        setAuthUrl(null)
        setSignupUrl(null)
      })
    return () => {
      active = false
    }
  }, [onEnter])

  return (
    <main className="min-h-dvh overflow-hidden bg-[#f7f4ed] text-slate-950">
      <div className="relative isolate">
        <div className="pointer-events-none absolute -right-32 -top-40 -z-10 size-[32rem] rounded-full bg-amber-200/50 blur-3xl" />
        <div className="pointer-events-none absolute -left-40 top-96 -z-10 size-[24rem] rounded-full bg-sky-200/40 blur-3xl" />

        <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8 sm:py-7">
          <a href="/" className="flex items-center gap-3" aria-label="Ávila CRM, início">
            <AvilaMark />
            <span><span className="block text-sm font-bold tracking-[0.16em] text-slate-900">Avila CRM</span><span className="block text-[10px] font-medium tracking-[0.12em] text-slate-500">Ávila Ops</span></span>
          </a>
          {authUrl && <div className="flex items-center gap-4"><a className="text-sm font-semibold text-slate-700 hover:text-slate-950" href={authUrl}>Entrar</a>{signupUrl && <a className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-800 hover:border-slate-500" href={signupUrl}>Criar minha conta</a>}</div>}
        </nav>

        <section className="mx-auto grid max-w-6xl gap-12 px-5 pb-16 pt-12 sm:px-8 sm:pb-24 sm:pt-20 lg:grid-cols-[1.1fr_.9fr] lg:items-center lg:gap-20">
          <div>
            <p className="mb-5 inline-flex items-center gap-2 rounded-full border border-amber-300/70 bg-amber-100/70 px-3 py-1.5 text-xs font-bold uppercase tracking-[0.16em] text-amber-800">
              <Sparkles size={14} aria-hidden="true" /> Operação mais clara
            </p>
            <h1 className="max-w-3xl text-5xl font-semibold leading-[1.02] tracking-[-0.045em] text-slate-950 sm:text-6xl lg:text-7xl">
              Relacionamentos bem cuidados viram crescimento.
            </h1>
            <p className="mt-6 max-w-xl text-lg leading-8 text-slate-600 sm:text-xl">
              O CRM da Ávila Ops para sua equipe acompanhar conversas, oportunidades e clientes com contexto, ritmo e responsabilidade.
            </p>
            <div className="mt-8">
              {checking ? (
                <StatusMessage>Conectando ao acesso Ávila Ops…</StatusMessage>
              ) : authUrl ? (
                <div className="flex flex-wrap items-center gap-3"><a className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-slate-950 px-5 py-3 text-sm font-bold text-white shadow-xl shadow-slate-950/20 transition-transform hover:-translate-y-0.5" href={authUrl}>
                  Acessar o CRM <ArrowRight size={18} aria-hidden="true" />
                </a>{signupUrl && <a className="inline-flex min-h-12 items-center justify-center rounded-xl border border-slate-300 bg-white/70 px-5 py-3 text-sm font-bold text-slate-800 hover:border-slate-500" href={signupUrl}>Criar minha conta</a>}</div>
              ) : (
                <StatusMessage>O acesso Ávila Ops está indisponível no momento.</StatusMessage>
              )}
            </div>
          </div>

          <div className="relative rounded-[2rem] border border-slate-200 bg-slate-950 p-3 shadow-2xl shadow-slate-950/20">
            <div className="rounded-[1.5rem] bg-[#151a22] p-5 text-white sm:p-7">
              <div className="flex items-center justify-between border-b border-white/10 pb-5">
                <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-300">Visão da operação</p><p className="mt-1 text-lg font-semibold">Hoje, sem ruído</p></div>
                <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold text-emerald-300">Ativo</span>
              </div>
              <div className="grid gap-3 py-5 sm:grid-cols-2">
                {['12 conversas aguardando', '8 oportunidades em avanço', '24 contatos acompanhados', '3 tarefas para hoje'].map((item, index) => (
                  <div key={item} className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
                    <div className={`mb-4 h-1.5 w-10 rounded-full ${index % 2 ? 'bg-sky-300' : 'bg-amber-300'}`} />
                    <p className="text-sm text-slate-300">{item}</p>
                  </div>
                ))}
              </div>
              <p className="border-t border-white/10 pt-5 text-sm leading-6 text-slate-400">Cada pessoa sabe o que precisa acontecer a seguir.</p>
            </div>
          </div>
        </section>
      </div>

      <section className="mx-auto grid max-w-6xl gap-4 px-5 pb-16 sm:grid-cols-3 sm:px-8 sm:pb-24">
        {features.map((feature) => <Feature key={feature.title} {...feature} />)}
      </section>

      <footer className="border-t border-slate-200/80 px-5 py-8 text-center text-xs text-slate-500 sm:px-8">
        Acesso protegido pela conta Ávila Ops.
      </footer>
    </main>
  )
}

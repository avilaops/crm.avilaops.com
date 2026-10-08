import { useEffect, useState, type FormEvent } from 'react'
import { getSession, getSsoStatus, login, type SessionUser } from '../../lib/auth'

/**
 * Porta de entrada do Agenda CRM.
 *
 * Segue a mesma casca do `auth.avilaops.com`: fundo escuro, cartão elevado e o
 * dourado da marca no botão que confirma. Quem entra pelo SSO sai de lá e cai
 * aqui, e antes disso a troca de um portal preto por uma tela branca de
 * template parecia dois produtos de empresas diferentes.
 *
 * O que existia aqui era a tela de seleção de conta do Kommo, copiada junto com
 * o resto do layout: perguntava "selecione uma conta" e listava uma conta
 * escrita à mão no código. Nós temos um espaço por pessoa, então esse passo
 * nunca teve o que escolher.
 */
export default function Login({ onEnter }: { onEnter: (user: SessionUser) => void }) {
  const [email, setEmail] = useState('')
  const [tenantSlug, setTenantSlug] = useState('')
  const [senha, setSenha] = useState('')
  const [erro, setErro] = useState('')
  const [verificando, setVerificando] = useState(true)
  const [enviando, setEnviando] = useState(false)
  const [urlSso, setUrlSso] = useState<string | null>(null)

  // Sessão viva entra direto. É o atalho que dá a sensação de SSO: quem já
  // passou pelo auth não vê formulário nenhum.
  useEffect(() => {
    getSession()
      .then((sessao) => {
        if (sessao.user) onEnter(sessao.user)
      })
      .catch(() => undefined)
      .finally(() => setVerificando(false))
  }, [onEnter])

  useEffect(() => {
    getSsoStatus()
      .then((status) => setUrlSso(status.enabled ? status.url : null))
      .catch(() => setUrlSso(null))
  }, [])

  async function entrar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault()
    setEnviando(true)
    setErro('')
    try {
      const sessao = await login(email, senha, tenantSlug)
      if (!sessao.user) throw 'Não foi possível abrir a sessão. Tente de novo.'
      onEnter(sessao.user)
    } catch (falha) {
      setErro(String(falha))
      setEnviando(false)
    }
  }

  if (verificando) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#0b0d10]">
        <p className="text-sm text-[#9aa1ab]">Verificando sessão…</p>
      </main>
    )
  }

  return (
    <main className="flex min-h-dvh items-center justify-center bg-[#0b0d10] px-4 py-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-[#e8eaed] sm:px-6 sm:py-12">
      <div className="w-full max-w-sm">
        <header className="mb-8 text-center">
          <div className="mx-auto mb-5 flex h-12 w-12 items-center justify-center rounded-xl border border-[#232830] bg-[#14171c]">
            <span className="text-lg font-semibold text-[#d9a441]">A</span>
          </div>
          <h1 className="text-xl font-semibold tracking-tight">Avila Ops</h1>
          <p className="mt-1.5 text-sm text-[#9aa1ab]">Entrar no Agenda CRM</p>
        </header>

        <div className="rounded-2xl border border-[#232830] bg-[#14171c] p-6">
          <form className="flex flex-col gap-4" onSubmit={entrar}>
            <label className="flex flex-col gap-1.5"><span className="text-xs text-[#9aa1ab]">Empresa (código do espaço, se informado no convite)</span><input className="rounded-lg border border-[#232830] bg-[#0b0d10] px-3 py-2.5 text-sm" value={tenantSlug} onChange={e => setTenantSlug(e.target.value)} autoCapitalize="none" /></label>
            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#9aa1ab]">E-mail</span>
              <input
                className="rounded-lg border border-[#232830] bg-[#0b0d10] px-3 py-2.5 text-sm outline-none focus:border-[#d9a441]"
                type="email"
                value={email}
                onChange={(evento) => setEmail(evento.target.value)}
                autoComplete="email"
                // O teclado do iPhone maiusculiza e corrige a primeira palavra,
                // e um e-mail com inicial maiúscula é recusado pelo login sem
                // dizer por quê.
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
              />
            </label>

            <label className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-[#9aa1ab]">Senha</span>
              <input
                className="rounded-lg border border-[#232830] bg-[#0b0d10] px-3 py-2.5 text-sm outline-none focus:border-[#d9a441]"
                type="password"
                value={senha}
                onChange={(evento) => setSenha(evento.target.value)}
                autoComplete="current-password"
                minLength={8}
                required
              />
            </label>

            {erro && (
              <p role="alert" className="text-xs leading-relaxed text-red-400">
                {erro}
              </p>
            )}

            <button
              className="mt-1 rounded-lg bg-[#d9a441] px-4 py-2.5 text-sm font-semibold text-[#1a1206] transition-opacity hover:opacity-90 disabled:opacity-60"
              type="submit"
              disabled={enviando}
            >
              {enviando ? 'Entrando…' : 'Entrar'}
            </button>
          </form>

          {urlSso && (
            <>
              <div className="my-5 flex items-center gap-3 text-[11px] uppercase tracking-wide text-[#9aa1ab]">
                <span className="h-px flex-1 bg-[#232830]" />
                ou
                <span className="h-px flex-1 bg-[#232830]" />
              </div>
              {/*
                O botão levava a logomarca do Google, mas o destino é o
                auth.avilaops.com. Quem escolhe o provedor é o portal, então
                prometer Google aqui era prometer uma tela que pode nem
                aparecer.
              */}
              <a
                className="flex w-full items-center justify-center gap-3 rounded-lg border border-[#232830] bg-[#0b0d10] px-4 py-2.5 text-sm font-medium hover:border-[#d9a441]"
                href={urlSso}
              >
                <span className="flex h-5 w-5 items-center justify-center rounded-md border border-[#232830] text-[11px] font-semibold text-[#d9a441]">
                  A
                </span>
                Entrar com a conta Avila Ops
              </a>
            </>
          )}
        </div>

        <p className="mt-6 text-center text-xs leading-relaxed text-[#9aa1ab]">
          Esqueceu a senha? Fale com a equipe Avila Ops, enviamos um link de recuperação.
        </p>
      </div>
    </main>
  )
}

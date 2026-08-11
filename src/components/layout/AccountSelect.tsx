import { ChevronRight } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { getSession, login, logout, type SessionUser } from '../../lib/auth'

function AccountSelect({ onEnter }: { onEnter: () => void }) {
  const [user, setUser] = useState<SessionUser | null>(null)
  const [email, setEmail] = useState('nicolasrosaab@gmail.com')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    getSession()
      .then((session) => {
        setUser(session.user)
        if (session.user) onEnter()
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [onEnter])

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      const session = await login(email, password)
      setUser(session.user)
      onEnter()
    } catch (loginError) {
      setError(String(loginError))
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLogout() {
    await logout().catch(() => undefined)
    setUser(null)
    setPassword('')
  }

  if (loading) {
    return (
      <main className="grid min-h-screen place-items-center bg-white text-[#080034]">
        <div className="text-sm font-semibold text-slate-500">Verificando sessão...</div>
      </main>
    )
  }

  if (!user) {
    return (
      <main className="min-h-screen bg-white px-6 py-10 text-[#080034]">
        <section className="mx-auto max-w-md">
          <h1 className="text-center text-3xl font-bold">Agenda CRM</h1>
          <form className="mt-9 rounded-md border border-slate-200 bg-white p-6 shadow-sm" onSubmit={handleLogin}>
            <label className="grid gap-2 text-sm font-semibold">
              Email
              <input className="input" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required />
            </label>
            <label className="mt-4 grid gap-2 text-sm font-semibold">
              Senha
              <input className="input" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" minLength={8} required />
            </label>
            {error && <p className="mt-4 rounded-md bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
            <button className="mt-6 w-full rounded-md bg-blue-600 px-4 py-3 text-sm font-bold text-white disabled:opacity-60" type="submit" disabled={submitting}>
              {submitting ? 'Entrando...' : 'Entrar'}
            </button>
          </form>
        </section>
      </main>
    )
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 text-[#080034]">
      <section className="mx-auto max-w-5xl">
        <h1 className="text-center text-3xl font-bold">Bem-vindo de volta, {user.name}</h1>
        <div className="mt-9 rounded-md bg-[#f7f4ff] px-6 py-8 text-center">
          <div className="mx-auto grid h-28 w-28 place-items-center rounded-full bg-yellow-300 text-3xl font-bold text-slate-950">{user.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}</div>
          <p className="mt-4 font-semibold text-[#8b81a8]">{user.email}</p>
          <div className="mt-7 flex flex-wrap justify-center gap-6 text-sm font-semibold">
            <button>Criar outra conta</button>
            <button>Acesse o portal do parceiro</button>
            <button onClick={handleLogout}>Sair</button>
          </div>
        </div>
        <h2 className="mt-9 text-center text-2xl font-bold">Selecione uma conta</h2>
        <button className="mt-7 flex w-full items-center justify-between rounded-md px-2 py-4 text-left hover:bg-slate-50" onClick={onEnter}>
          <span className="flex items-center gap-4">
            <span className="rounded-md bg-yellow-200 px-8 py-2 text-xs font-semibold">Teste</span>
            <span className="font-bold">nicolasrosadb</span>
          </span>
          <ChevronRight />
        </button>
      </section>
    </main>
  )
}

export default AccountSelect



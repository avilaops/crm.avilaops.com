import { LogOut, MonitorSmartphone } from 'lucide-react'
import { useEffect, useState, type FormEvent } from 'react'
import { FormField, FormSection, Notice, StickyActionBar } from '../../components/ui/Form'
import { ToneBadge } from '../../components/ui/StatusBadge'
import { changePassword, getMe, listMySessions, revokeOtherSessions, updateMe, type AccountSession } from '../../lib/account'
import type { Tone } from '../../lib/connection'
import { initials, roleLabel, useSession } from '../../lib/session'
import { buttonClass } from '../../lib/ui'
import { useFormState } from '../../lib/useFormState'
import { SettingsFrame } from './SettingsFrame'

type Feedback = { tone: Tone; text: string } | null

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' })

function errorText(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : typeof error === 'string' ? error : fallback
}

/** Minha conta › Perfil: os dados da pessoa, não da empresa. */
export function ProfileSettings() {
  const { user, updateUser, signOut } = useSession()
  const { form, setForm, dirty, load, reset } = useFormState({ name: user.name })
  const [saving, setSaving] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)

  async function save(event: FormEvent) {
    event.preventDefault()
    setSaving(true)
    setFeedback(null)
    try {
      const result = await updateMe({ name: form.name.trim() })
      updateUser(result.user)
      load({ name: result.user.name })
      setFeedback({ tone: 'success', text: 'Perfil salvo.' })
    } catch (error) {
      setFeedback({ tone: 'danger', text: errorText(error, 'Não foi possível salvar o perfil.') })
    } finally {
      setSaving(false)
    }
  }

  return (
    <SettingsFrame page="profile-settings" title="Perfil">
      <form onSubmit={save} className="space-y-5">
        <div className="flex items-center gap-4">
          <span className="grid size-16 shrink-0 place-items-center rounded-full bg-amber-300 text-xl font-bold text-slate-900" aria-hidden="true">
            {initials(form.name || user.name)}
          </span>
          <div className="min-w-0">
            <p className="truncate text-lg font-semibold text-slate-900">{user.name}</p>
            <p className="truncate text-sm text-slate-500">{roleLabel(user.role)}</p>
          </div>
        </div>

        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

        <FormSection title="Seus dados" description="Aparecem para a equipe nas conversas que você atende.">
          <FormField label="Nome">
            <input
              className="input"
              value={form.name}
              onChange={(event) => setForm({ name: event.target.value })}
              autoComplete="name"
              minLength={2}
              required
            />
          </FormField>
          <dl className="grid gap-3 text-sm">
            <div className="grid gap-0.5">
              <dt className="font-medium text-slate-700">E-mail de acesso</dt>
              <dd className="break-all text-slate-900">{user.email}</dd>
              <dd className="text-xs text-slate-500">Quem administra a conta altera o e-mail, em Usuários e equipes.</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="font-medium text-slate-700">Papel</dt>
              <dd className="text-slate-900">{roleLabel(user.role)}</dd>
            </div>
            <div className="grid gap-0.5">
              <dt className="font-medium text-slate-700">Idioma</dt>
              <dd className="text-slate-900">Português (Brasil)</dd>
            </div>
          </dl>
        </FormSection>

        <StickyActionBar visible={dirty}>
          <button type="button" className={buttonClass.secondary} onClick={reset}>
            Descartar
          </button>
          <button type="submit" className={buttonClass.primary} disabled={saving || form.name.trim().length < 2}>
            {saving ? 'Salvando…' : 'Salvar'}
          </button>
        </StickyActionBar>
      </form>

      <div className="mt-6 border-t border-slate-200 pt-5">
        <button type="button" className={buttonClass.danger} onClick={signOut}>
          <LogOut size={16} aria-hidden="true" />
          Sair desta conta
        </button>
      </div>
    </SettingsFrame>
  )
}

/** Minha conta › Segurança: senha e sessões abertas. */
export function SecuritySettings() {
  const [hasPassword, setHasPassword] = useState<boolean | null>(null)
  const [sessions, setSessions] = useState<AccountSession[] | null>(null)
  const [passwords, setPasswords] = useState({ current: '', next: '', confirm: '' })
  const [saving, setSaving] = useState(false)
  const [revoking, setRevoking] = useState(false)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [sessionFeedback, setSessionFeedback] = useState<Feedback>(null)

  const [version, setVersion] = useState(0)
  const reloadSessions = () => setVersion((value) => value + 1)

  useEffect(() => {
    getMe()
      .then((result) => setHasPassword(result.hasPassword))
      .catch(() => setHasPassword(true))
  }, [])

  useEffect(() => {
    let active = true
    listMySessions()
      .then((result) => active && setSessions(result.sessions))
      .catch(() => active && setSessions([]))
    return () => {
      active = false
    }
  }, [version])

  const mismatch = passwords.confirm.length > 0 && passwords.next !== passwords.confirm
  const tooShort = passwords.next.length > 0 && passwords.next.length < 8
  const ready = passwords.current.length > 0 && passwords.next.length >= 8 && passwords.next === passwords.confirm

  async function submitPassword(event: FormEvent) {
    event.preventDefault()
    if (!ready) return
    setSaving(true)
    setFeedback(null)
    try {
      const result = await changePassword({ currentPassword: passwords.current, newPassword: passwords.next })
      setPasswords({ current: '', next: '', confirm: '' })
      setFeedback({
        tone: 'success',
        text:
          result.otherSessionsClosed > 0
            ? `Senha alterada. ${result.otherSessionsClosed} outra(s) sessão(ões) foi(ram) encerrada(s).`
            : 'Senha alterada.',
      })
      reloadSessions()
    } catch (error) {
      setFeedback({ tone: 'danger', text: errorText(error, 'Não foi possível alterar a senha.') })
    } finally {
      setSaving(false)
    }
  }

  async function revokeOthers() {
    setRevoking(true)
    setSessionFeedback(null)
    try {
      const result = await revokeOtherSessions()
      setSessionFeedback({ tone: 'success', text: `${result.closed} sessão(ões) encerrada(s).` })
      reloadSessions()
    } catch (error) {
      setSessionFeedback({ tone: 'danger', text: errorText(error, 'Não foi possível encerrar as sessões.') })
    } finally {
      setRevoking(false)
    }
  }

  const others = sessions?.filter((session) => !session.current).length ?? 0

  return (
    <SettingsFrame page="security-settings" title="Segurança">
      <div className="space-y-5">
        <FormSection title="Senha" description="Ao trocar a senha, as outras sessões abertas com a sua conta são encerradas.">
          {hasPassword === false ? (
            <Notice tone="info">Você entra pela conta Ávila Ops. A senha é a dessa conta, e muda por lá.</Notice>
          ) : (
            <form onSubmit={submitPassword} className="grid gap-4">
              {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}
              <FormField label="Senha atual">
                <input
                  className="input"
                  type="password"
                  autoComplete="current-password"
                  value={passwords.current}
                  onChange={(event) => setPasswords((current) => ({ ...current, current: event.target.value }))}
                  required
                />
              </FormField>
              <div className="grid gap-4 medium:grid-cols-2">
                <FormField label="Nova senha" hint="Pelo menos 8 caracteres." error={tooShort ? 'Use pelo menos 8 caracteres.' : null}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={tooShort}
                    value={passwords.next}
                    onChange={(event) => setPasswords((current) => ({ ...current, next: event.target.value }))}
                    required
                  />
                </FormField>
                <FormField label="Repita a nova senha" error={mismatch ? 'As senhas não são iguais.' : null}>
                  <input
                    className="input"
                    type="password"
                    autoComplete="new-password"
                    aria-invalid={mismatch}
                    value={passwords.confirm}
                    onChange={(event) => setPasswords((current) => ({ ...current, confirm: event.target.value }))}
                    required
                  />
                </FormField>
              </div>
              <div>
                <button type="submit" className={buttonClass.primary} disabled={!ready || saving}>
                  {saving ? 'Alterando…' : 'Alterar senha'}
                </button>
              </div>
            </form>
          )}
        </FormSection>

        <section className="rounded-xl border border-slate-200 bg-white p-4 medium:p-6">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-900">Verificação em 2 etapas</h3>
            <ToneBadge tone="neutral">Em breve</ToneBadge>
          </div>
          <p className="mt-1 text-sm text-slate-500">Um código no celular além da senha, pedido a cada novo acesso. Ainda não está disponível no Agenda CRM.</p>
        </section>

        <section className="rounded-xl border border-slate-200 bg-white p-4 medium:p-6">
          <h3 className="text-base font-semibold text-slate-900">Sessões abertas</h3>
          <p className="mt-1 text-sm text-slate-500">Cada navegador em que você entrou e ainda não saiu. Uma sessão vale por 7 dias.</p>
          {sessionFeedback && <div className="mt-4"><Notice tone={sessionFeedback.tone}>{sessionFeedback.text}</Notice></div>}
          <ul className="mt-4 divide-y divide-slate-100">
            {sessions === null && <li className="py-3 text-sm text-slate-500">Carregando sessões…</li>}
            {sessions?.map((session) => (
              <li key={session.id} className="flex items-start gap-3 py-3">
                <MonitorSmartphone size={18} className="mt-0.5 shrink-0 text-slate-500" aria-hidden="true" />
                <div className="min-w-0 flex-1 text-sm">
                  <p className="font-medium text-slate-900">
                    {session.current ? 'Este navegador' : 'Outro navegador'}
                  </p>
                  <p className="text-slate-500">
                    Entrou em {dateTime.format(new Date(session.created_at))} · último uso {dateTime.format(new Date(session.last_seen_at))}
                  </p>
                </div>
                {session.current && <ToneBadge tone="success">Atual</ToneBadge>}
              </li>
            ))}
          </ul>
          {others > 0 && (
            <button type="button" className={`${buttonClass.secondary} mt-3`} disabled={revoking} onClick={revokeOthers}>
              {revoking ? 'Encerrando…' : `Encerrar as outras ${others} sessão(ões)`}
            </button>
          )}
        </section>
      </div>
    </SettingsFrame>
  )
}

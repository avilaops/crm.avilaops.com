import { UserPlus } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { FormField, FormSection, Notice } from '../../components/ui/Form'
import { ToneBadge } from '../../components/ui/StatusBadge'
import type { Tone } from '../../lib/connection'
import { createUser, inviteUser, listUsers, updateUser, type CrmUser } from '../../lib/crm'
import { afterInvite, inviteLine } from '../../lib/userInvite'
import { initials, useSession } from '../../lib/session'
import { buttonClass } from '../../lib/ui'
import { SettingsFrame } from './SettingsFrame'

type Feedback = { tone: Tone; text: string } | null

const roles = [
  { value: 'atendente', label: 'Atendente', hint: 'Atende conversas e cuida dos próprios negócios.' },
  { value: 'gerente', label: 'Gerente', hint: 'Também muda as configurações da área de trabalho.' },
  { value: 'admin', label: 'Administrador', hint: 'Acesso total, inclusive canais e usuários.' },
]

const emptyForm = { name: '', email: '', role: 'atendente', password: '' }

/**
 * Área de trabalho › Usuários e equipes.
 *
 * No celular cada pessoa é um cartão; a tabela de 920px que estava aqui só se
 * lia rolando para o lado. As colunas "Leads", "Contatos" e "Empresas" saíram:
 * repetiam o papel da pessoa em vez de contar alguma coisa.
 */
export function UsersSettings() {
  const { user: me } = useSession()
  const [users, setUsers] = useState<CrmUser[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [resending, setResending] = useState<string | null>(null)
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [form, setForm] = useState(emptyForm)
  const [version, setVersion] = useState(0)
  const reload = () => setVersion((value) => value + 1)

  useEffect(() => {
    let active = true
    listUsers()
      .then((result) => active && setUsers(result.users))
      .catch((error: Error) => active && setFeedback({ tone: 'danger', text: error.message }))
      .finally(() => active && setLoading(false))
    return () => {
      active = false
    }
  }, [version])

  // Trava síncrona: dois toques no mesmo instante passam pelo `disabled`, que só
  // vale depois do próximo desenho, e cada envio a mais é um e-mail a mais.
  const sending = useRef(false)

  async function invite(event: FormEvent) {
    event.preventDefault()
    if (sending.current) return
    sending.current = true
    setSaving(true)
    setFeedback(null)
    try {
      const { user } = await createUser({ name: form.name.trim(), email: form.email.trim(), role: form.role, password: form.password || undefined })
      setForm(emptyForm)
      setFeedback(afterInvite(user, 'adicionada'))
      reload()
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível adicionar a pessoa.' })
    } finally {
      sending.current = false
      setSaving(false)
    }
  }

  async function resend(userId: string) {
    if (sending.current) return
    sending.current = true
    setResending(userId)
    setFeedback(null)
    try {
      const { user } = await inviteUser(userId)
      setUsers((current) => current.map((item) => (item.id === userId ? user : item)))
      setFeedback(afterInvite(user, 'convidada'))
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível enviar o convite.' })
    } finally {
      sending.current = false
      setResending(null)
    }
  }

  async function change(userId: string, input: Partial<{ role: string; active: boolean }>) {
    setFeedback(null)
    try {
      const result = await updateUser(userId, input)
      setUsers((current) => current.map((item) => (item.id === userId ? result.user : item)))
      setFeedback({ tone: 'success', text: 'Usuário atualizado.' })
    } catch (error) {
      setFeedback({ tone: 'danger', text: error instanceof Error ? error.message : 'Não foi possível atualizar o usuário.' })
    }
  }

  const roleHint = roles.find((role) => role.value === form.role)?.hint

  return (
    <SettingsFrame page="users" title="Usuários e equipes">
      <div className="space-y-5">
        {feedback && <Notice tone={feedback.tone}>{feedback.text}</Notice>}

        <FormSection title="Adicionar pessoa" description="Cada atendente com o próprio acesso: a auditoria mostra quem fez o quê.">
          <form onSubmit={invite} className="grid gap-4">
            <div className="grid gap-4 medium:grid-cols-2">
              <FormField label="Nome">
                <input className="input" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} autoComplete="off" required />
              </FormField>
              <FormField label="E-mail">
                <input
                  className="input"
                  type="email"
                  inputMode="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={form.email}
                  onChange={(event) => setForm({ ...form, email: event.target.value })}
                  autoComplete="off"
                  required
                />
              </FormField>
              <FormField label="Papel" hint={roleHint}>
                <select className="input" value={form.role} onChange={(event) => setForm({ ...form, role: event.target.value })}>
                  {roles.map((role) => (
                    <option key={role.value} value={role.value}>{role.label}</option>
                  ))}
                </select>
              </FormField>
              <FormField label="Senha inicial" hint="Deixe em branco: a pessoa recebe um convite por e-mail e cria a própria senha na conta Ávila Ops.">
                <input
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={form.password}
                  onChange={(event) => setForm({ ...form, password: event.target.value })}
                />
              </FormField>
            </div>
            <div>
              <button type="submit" className={`${buttonClass.primary} w-full medium:w-auto`} disabled={saving}>
                <UserPlus size={16} aria-hidden="true" />
                {saving ? 'Adicionando…' : 'Adicionar'}
              </button>
            </div>
          </form>
        </FormSection>

        <section aria-labelledby="equipe-titulo" className="rounded-xl border border-slate-200 bg-white">
          <h3 id="equipe-titulo" className="border-b border-slate-100 px-4 py-3 text-base font-semibold text-slate-900 medium:px-6">
            Equipe {users.length > 0 && <span className="font-normal text-slate-500">· {users.length}</span>}
          </h3>
          {loading && <p className="px-4 py-6 text-sm text-slate-500 medium:px-6">Carregando…</p>}
          <ul className="divide-y divide-slate-100">
            {users.map((item) => {
              const self = item.id === me.id
              return (
                <li key={item.id} className="grid gap-3 px-4 py-4 medium:grid-cols-[minmax(0,1fr)_auto] medium:items-center medium:px-6">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid size-10 shrink-0 place-items-center rounded-full bg-slate-200 text-xs font-bold text-slate-700" aria-hidden="true">
                      {initials(item.name)}
                    </span>
                    <div className="min-w-0">
                      <p className="flex flex-wrap items-center gap-2 font-medium text-slate-900">
                        <span className="truncate">{item.name}</span>
                        {self && <ToneBadge tone="info">Você</ToneBadge>}
                        {!item.active && <ToneBadge tone="neutral">Desativado</ToneBadge>}
                      </p>
                      <p className="truncate text-sm text-slate-500">{item.email}</p>
                      {inviteLine(item) && <p className="text-xs text-slate-500">{inviteLine(item)}</p>}
                    </div>
                  </div>
                  {/* No celular o papel ocupa a linha e os botões vão para a de baixo:
                      os três lado a lado não cabem em 375px. */}
                  <div className="flex flex-wrap items-center gap-2">
                    <select
                      className="input w-auto! min-w-0 flex-1 basis-full medium:flex-none medium:basis-auto"
                      aria-label={`Papel de ${item.name}`}
                      value={item.role === 'manager' ? 'gerente' : item.role}
                      disabled={self}
                      title={self ? 'Ninguém altera o próprio papel.' : undefined}
                      onChange={(event) => change(item.id, { role: event.target.value })}
                    >
                      {roles.map((role) => (
                        <option key={role.value} value={role.value}>{role.label}</option>
                      ))}
                    </select>
                    {!self && item.active && (
                      <button type="button" className={buttonClass.secondary} disabled={resending !== null} onClick={() => resend(item.id)}>
                        {resending === item.id ? 'Enviando…' : item.invite_status ? 'Enviar convite de novo' : 'Enviar convite'}
                      </button>
                    )}
                    {!self && (
                      <button type="button" className={buttonClass.secondary} onClick={() => change(item.id, { active: !item.active })}>
                        {item.active ? 'Desativar' : 'Reativar'}
                      </button>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>
      </div>
    </SettingsFrame>
  )
}

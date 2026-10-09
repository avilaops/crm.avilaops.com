import type { Tone } from './connection'
import type { CrmUser } from './crm'

/**
 * O convite de quem entra na equipe, em palavras de tela.
 *
 * O backend guarda o resultado sem acento (como toda mensagem dele) e nunca o
 * endereço de criar a senha; aqui ele vira a linha da lista e o aviso depois
 * de adicionar ou reenviar.
 */

type Invited = Pick<CrmUser, 'name' | 'email' | 'invite_status' | 'invite_detail' | 'invite_at'>

const LABELS: Record<NonNullable<CrmUser['invite_status']>, string> = {
  enviado: 'Convite enviado',
  falhou: 'Convite não enviado',
  pendente: 'Convite pendente',
}

const DETAILS: Record<string, string> = {
  'com o endereco para criar a senha': 'com o endereço para criar a senha',
  'a pessoa ja tinha conta Avila Ops': 'a pessoa já tinha conta Ávila Ops e entra com a senha que já usa',
}

function when(iso: string | null | undefined): string {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return ` em ${date.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}`
}

/** A linha sob o e-mail na lista; `null` para quem nunca foi convidado. */
export function inviteLine(user: Invited): string | null {
  if (!user.invite_status) return null
  const detail = user.invite_detail ? (DETAILS[user.invite_detail] ?? user.invite_detail) : ''
  return `${LABELS[user.invite_status]}${when(user.invite_at)}${detail ? `: ${detail}` : ''}`
}

/** O aviso logo depois de adicionar a pessoa ou de reenviar o convite. */
export function afterInvite(user: Invited, verb: 'adicionada' | 'convidada'): { tone: Tone; text: string } {
  if (user.invite_status === 'enviado') {
    return { tone: 'success', text: `Convite enviado para ${user.email}: ${DETAILS[user.invite_detail ?? ''] ?? user.invite_detail ?? 'a pessoa já pode entrar'}.` }
  }
  if (user.invite_status) {
    const lead = verb === 'adicionada' ? `${user.name} foi adicionada, mas o convite não saiu` : 'O convite não saiu'
    return { tone: 'warning', text: `${lead}. ${user.invite_detail ?? ''}`.trim() }
  }
  return { tone: 'success', text: `${user.name} já pode entrar no CRM com a senha inicial.` }
}

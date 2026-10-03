/**
 * Contato da equipe Ávila Ops, para os caminhos assistidos (conexão do
 * WhatsApp, mudança de plano).
 *
 * Vem de variável de ambiente e não do código: o número e o e-mail de suporte
 * mudam por ambiente, e escrever um deles aqui faria o cliente de homologação
 * chamar a operação de produção. Sem variável, a tela não oferece o botão — e
 * diz para falar com quem administra a conta, em vez de um link quebrado.
 */
import { parseSupportContact } from './supportConfig'

const { whatsapp, email } = parseSupportContact(import.meta.env.VITE_SUPORTE_WHATSAPP, import.meta.env.VITE_SUPORTE_EMAIL)

export type SupportLinks = { whatsapp: string | null; email: string | null }

export function supportLinks(message: string, subject = 'Agenda CRM'): SupportLinks {
  return {
    whatsapp: whatsapp ? `https://wa.me/${whatsapp}?text=${encodeURIComponent(message)}` : null,
    email: email ? `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}` : null,
  }
}

export const hasSupportContact = Boolean(whatsapp || email)


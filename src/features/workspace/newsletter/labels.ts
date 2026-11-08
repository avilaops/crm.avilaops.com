import type { CampaignDraft } from '../../../lib/mail'

/** Nome legível de cada etiqueta de catálogo. O resto aparece como veio. */
const TAG_LABEL: Record<string, string> = {
  transporte: 'Transporte e logística',
  industria: 'Indústria e metalurgia',
  'maquinas-pecas': 'Máquinas e peças',
  'usinas-agro': 'Usinas e agro',
  'eletrica-hidraulica': 'Elétrica e hidráulica',
  'quimica-diversos': 'Química e diversos',
  'cobranca-servicos': 'Cobrança e serviços',
  'prospeccao-antiga': 'Prospecção (base antiga)',
  faturamento: 'Caixa do faturamento',
  'email-invalido': 'E-mail inválido',
  b2b: 'B2B',
  agenda: 'Agenda de telefone',
  clientes: 'Clientes',
}

export const FORMAT_LABEL: Record<string, string> = { html: 'HTML', text: 'Mensagem', image: 'Imagem' }

export const STATUS_LABEL: Record<string, string> = {
  draft: 'Rascunho',
  scheduled: 'Agendada',
  paused: 'Pausada',
  sending: 'Enviando',
  sent: 'Enviada',
  failed: 'Falhou',
  subscribed: 'Inscrito',
  unsubscribed: 'Descadastrado',
  pending: 'Na fila',
  skipped: 'Pulado',
}

export function tagLabel(tag: string) {
  return TAG_LABEL[tag] ?? tag
}

export function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

export function parseTags(value: string) {
  return value
    .split(',')
    .map((tag) => tag.trim().toLowerCase())
    .filter(Boolean)
}

/** Rascunho vazio: o estado inicial do compositor e o reset do "comecar do zero". */
export const EMPTY_DRAFT: CampaignDraft = {
  name: '',
  subject: '',
  previewText: '',
  format: 'html',
  html: '',
  text: '',
  imageUrl: '',
  imageAlt: '',
  imageLinkUrl: '',
  audienceTags: [],
}

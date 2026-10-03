import {
  BookOpen,
  Bot,
  Building2,
  CalendarDays,
  Home,
  KanbanSquare,
  KeyRound,
  MessageCircle,
  Package,
  Plug,
  Receipt,
  ShieldCheck,
  Sparkles,
  UserRound,
  UsersRound,
  type LucideIcon,
} from 'lucide-react'
import type { Page, SettingsPage } from './types'

/**
 * Mapa de navegação do CRM.
 *
 * Dois níveis no máximo (seção e item). Auditoria saiu do menu principal e
 * mora só em Configurações; Newsletter foi para Automação, porque é envio em
 * massa e, no WhatsApp, usa modelo de marketing pago — não é conversa.
 */

export type NavChild = { page: Page; label: string; badge?: string }

export type NavSection = {
  id: string
  label: string
  icon: LucideIcon
  /** Destino ao tocar na seção: a página dela ou o primeiro item. */
  page: Page
  children?: NavChild[]
}

export const navSections: NavSection[] = [
  { id: 'inicio', label: 'Início', icon: Home, page: 'home' },
  {
    id: 'conversas',
    label: 'Conversas',
    icon: MessageCircle,
    page: 'chat-inbox',
    children: [
      { page: 'chat-inbox', label: 'Caixa de entrada' },
      { page: 'mail-inbox', label: 'E-mail' },
      { page: 'team-chat', label: 'Equipe' },
    ],
  },
  {
    id: 'vendas',
    label: 'Vendas',
    icon: KanbanSquare,
    page: 'pipeline',
    children: [
      { page: 'pipeline', label: 'Funil' },
      { page: 'leads', label: 'Leads' },
    ],
  },
  {
    id: 'contatos',
    label: 'Contatos',
    icon: UsersRound,
    page: 'contacts',
    children: [
      { page: 'contacts', label: 'Pessoas' },
      { page: 'companies', label: 'Empresas' },
      { page: 'all-contacts', label: 'Pessoas e empresas' },
      { page: 'segments', label: 'Segmentos', badge: 'Beta' },
    ],
  },
  { id: 'agenda', label: 'Agenda', icon: CalendarDays, page: 'calendar' },
  {
    id: 'automacao',
    label: 'Automação',
    icon: Bot,
    page: 'ai-agent',
    children: [
      { page: 'ai-agent', label: 'Agente de IA' },
      { page: 'automations', label: 'Automações' },
      { page: 'newsletter', label: 'Newsletter' },
    ],
  },
  {
    id: 'catalogo',
    label: 'Catálogo',
    icon: Package,
    page: 'products',
    children: [
      { page: 'products', label: 'Produtos' },
      { page: 'media', label: 'Mídia' },
    ],
  },
]

/** As quatro seções da barra inferior do celular; as outras ficam em "Mais". */
export const bottomBarSections = ['inicio', 'conversas', 'vendas', 'contatos']

export function sectionOf(page: Page) {
  return navSections.find((section) => section.page === page || section.children?.some((child) => child.page === page))
}

export function pageLabel(page: Page) {
  for (const section of navSections) {
    if (section.page === page && !section.children) return section.label
    const child = section.children?.find((item) => item.page === page)
    if (child) return child.label
  }
  return settingsItems.find((item) => item.page === page)?.label ?? settingsChildren[page as SettingsPage]?.label ?? 'Configurações'
}

// ── Configurações ───────────────────────────────────────────────────────────

export type SettingsGroupId = 'conta' | 'workspace'

export const settingsGroups: { id: SettingsGroupId; label: string; hint: string }[] = [
  { id: 'conta', label: 'Minha conta', hint: 'Vale só para você.' },
  { id: 'workspace', label: 'Área de trabalho', hint: 'Vale para toda a empresa.' },
]

export type SettingsItem = {
  page: SettingsPage
  label: string
  description: string
  icon: LucideIcon
  group: SettingsGroupId
  /** Só administrador e gerente mexem; o servidor confere o mesmo. */
  manage?: boolean
}

export const settingsItems: SettingsItem[] = [
  { page: 'profile-settings', label: 'Perfil', description: 'Seu nome e e-mail de acesso', icon: UserRound, group: 'conta' },
  { page: 'security-settings', label: 'Segurança', description: 'Senha e sessões abertas', icon: KeyRound, group: 'conta' },
  { page: 'workspace-settings', label: 'Geral', description: 'Empresa, fuso e horário de atendimento', icon: Building2, group: 'workspace', manage: true },
  { page: 'users', label: 'Usuários e equipes', description: 'Convites e papéis', icon: UsersRound, group: 'workspace', manage: true },
  { page: 'channels', label: 'Canais', description: 'WhatsApp, e-mail e regras de atendimento', icon: MessageCircle, group: 'workspace', manage: true },
  { page: 'integrations', label: 'Integrações', description: 'Messageria, ERP, Google Agenda e n8n', icon: Plug, group: 'workspace', manage: true },
  { page: 'ai-settings', label: 'Agente de IA', description: 'Tom de voz e piloto automático', icon: Sparkles, group: 'workspace', manage: true },
  { page: 'knowledge', label: 'Base de conhecimento', description: 'O que a IA consulta antes de responder', icon: BookOpen, group: 'workspace', manage: true },
  { page: 'billing', label: 'Faturamento', description: 'Plano e custo das mensagens do WhatsApp', icon: Receipt, group: 'workspace', manage: true },
  { page: 'audit-logs', label: 'Segurança e auditoria', description: 'Quem fez o quê, e quando', icon: ShieldCheck, group: 'workspace', manage: true },
]

/** Terceiro nível: abre dentro de um item da lista e volta para ele. */
export const settingsChildren: Partial<Record<SettingsPage, { parent: SettingsPage; label: string }>> = {
  'whatsapp-channel': { parent: 'channels', label: 'WhatsApp' },
  'mail-settings': { parent: 'channels', label: 'E-mail' },
  'chat-settings': { parent: 'channels', label: 'Regras de atendimento' },
}

/** O item da lista que fica marcado quando a página aberta é de terceiro nível. */
export function settingsItemFor(page: SettingsPage) {
  const target = settingsChildren[page]?.parent ?? page
  return settingsItems.find((item) => item.page === target)
}

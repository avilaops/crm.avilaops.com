import {
  Bot,
  CalendarDays,
  FileText,
  Home,
  KanbanSquare,
  MessageCircle,
  Sparkles,
  UsersRound,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { Page } from '../types'

type NavChild = {
  id: Page
  label: string
}

type NavItem = {
  id: Page | string
  label: string
  icon: LucideIcon
  badge?: string
  children?: NavChild[]
}

type NavGroup = {
  items: NavItem[]
}

export const navGroups: NavGroup[] = [
  {
    items: [
      { id: 'home', label: 'Início', icon: Home },
      {
        id: 'communications',
        label: 'Comunicações',
        icon: MessageCircle,
        children: [
          { id: 'chat-inbox', label: 'Inbox de chat' },
          { id: 'mail-inbox', label: 'Inbox de email' },
          { id: 'team-chat', label: 'Chats da equipe' },
        ],
      },
      {
        id: 'pipelines',
        label: 'Pipelines',
        icon: KanbanSquare,
        children: [
          { id: 'pipeline', label: 'Funil de vendas' },
          { id: 'leads', label: 'Todos os leads' },
        ],
      },
      { id: 'calendar', label: 'Calendário', icon: CalendarDays },
      { id: 'segments', label: 'Segmentos', icon: UsersRound, badge: 'Beta' },
      {
        id: 'lists',
        label: 'Listas',
        icon: FileText,
        children: [
          { id: 'contacts', label: 'Contatos' },
          { id: 'companies', label: 'Empresas' },
          { id: 'all-contacts', label: 'Todos os contatos e empresas' },
          { id: 'media', label: 'Mídia' },
          { id: 'products', label: 'Produtos' },
        ],
      },
      { id: 'ai-agent', label: 'Agente de IA', icon: Sparkles },
      { id: 'automations', label: 'Automações', icon: Bot },
    ],
  },
]

export const settingsItems = [
  ['Perfil', 'profile-settings', 'Configurações de perfil'],
  ['Área de trabalho', 'workspace-settings', 'Configurações de trabalho'],
  ['Área de trabalho', 'chat-settings', 'Configurações de chat'],
  ['Área de trabalho', 'mail-settings', 'Configurações de email'],
  ['Área de trabalho', 'billing', 'Faturamento'],
  ['Área de trabalho', 'users', 'Gestão de usuários'],
  ['Funil de vendas', 'lead-sources', 'Fontes de lead'],
  ['IA', 'ai-settings', 'Configurações de IA'],
  ['IA', 'knowledge', 'Fontes de conhecimento'],
  ['Integrações e canais', 'integrations', 'Central de integrações'],
  ['Integrações e canais', 'channels', 'Canais Meta'],
] as const

export const integrations = [
  'WhatsApp Business',
  'TikTok',
  'Instagram',
  'Facebook',
  'Telegram',
  'Slack',
  'Wazzup',
  'Google Sheets',
  'Webhooks',
  'Zapier',
  'Make',
  'Stripe',
  'PayPal',
  'Asaas',
  'Google Agenda',
  'Zoom',
  'Twilio',
  'OpenAI',
  'Shopify',
  'WooCommerce',
  'RD Station',
  'HubSpot',
  'Pipedrive',
  'Jotform',
  'Typeform',
  'Dropbox',
  'Google Drive',
  'Clicksign',
] as const

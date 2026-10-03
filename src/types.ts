export type Screen = 'login' | 'app'

export type WorkspacePage =
  | 'home'
  | 'chat-inbox'
  | 'mail-inbox'
  | 'newsletter'
  | 'team-chat'
  | 'pipeline'
  | 'leads'
  | 'calendar'
  | 'segments'
  | 'contacts'
  | 'companies'
  | 'all-contacts'
  | 'media'
  | 'products'
  | 'ai-agent'
  | 'automations'

export type SettingsPage =
  | 'settings'
  | 'profile-settings'
  | 'security-settings'
  | 'workspace-settings'
  | 'users'
  | 'channels'
  | 'whatsapp-channel'
  | 'mail-settings'
  | 'chat-settings'
  | 'integrations'
  | 'ai-settings'
  | 'knowledge'
  | 'billing'
  | 'audit-logs'

export type Page = WorkspacePage | SettingsPage

/** Página e, quando a tela tem um segundo nível, o item aberto nele. */
export type Route = {
  page: Page
  /** Ex.: a conversa aberta no inbox. Fica no endereço para o Voltar funcionar. */
  param?: string
}

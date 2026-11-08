'use client'

import { useNavigation } from '../../lib/navigationContext'
import { ChatInbox } from '../../features/workspace/WorkspacePages'

export { default as CrmPage } from './CrmPage'
export { default as SettingsShell } from '../../features/settings/SettingsPages'
export { default as HomeScreen } from '../../features/workspace/HomePage'
export { default as MailScreen } from '../../features/workspace/MailInbox'
export { default as NewsletterScreen } from '../../features/workspace/newsletter/NewsletterPage'
export { default as TeamChatScreen } from '../../features/workspace/TeamChatPage'
export { default as ProductsScreen } from '../../features/workspace/ProductsPage'
export { default as AutomationsScreen } from '../../features/workspace/AutomationsPage'
export { default as SegmentsScreen } from '../../features/workspace/SegmentsPage'
export { default as MediaScreen } from '../../features/workspace/MediaPage'
export { default as AllContactsScreen } from '../../features/workspace/AllContactsPage'
export { default as AiAgentScreen } from '../../features/workspace/AiAgentPage'
export { Pipeline, LeadsList, TasksPage, ContactsList, CompaniesList } from '../../features/workspace/WorkspacePages'
export { ProfileSettings, SecuritySettings } from '../../features/settings/AccountSettings'
export { AuditLogsPage } from '../../features/settings/AuditLogsPage'
export { BillingSettings } from '../../features/settings/BillingSettings'
export { ChannelsSettings } from '../../features/settings/ChannelsSettings'
export { default as IntegrationCenterPage } from '../../features/settings/IntegrationCenterPage'
export { KnowledgeSettings } from '../../features/settings/KnowledgeSettings'
export { default as MailSettings } from '../../features/settings/MailSettings'
export { UsersSettings } from '../../features/settings/UsersSettings'
export { WhatsAppChannelPage } from '../../features/settings/WhatsAppChannelPage'
export { AiSettings, GeneralSettings, ServiceRulesSettings } from '../../features/settings/WorkspaceSettings'

export function ConversationsScreen() {
  const { route, navigate } = useNavigation()
  return <ChatInbox
    conversationId={route.param ?? null}
    openConversation={(id) => navigate({ page: 'chat-inbox', param: id })}
    closeConversation={() => navigate('chat-inbox')}
    connectChannel={() => navigate('whatsapp-channel')}
  />
}

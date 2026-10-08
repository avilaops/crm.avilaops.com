import { useState } from 'react'
import { NavRow } from '../../components/ui/Rows'
import { settingsGroups, settingsItemFor, settingsItems } from '../../navigation'
import { useNavigation } from '../../lib/navigationContext'
import { useSession } from '../../lib/session'
import { EXPANDED_QUERY, useMediaQuery } from '../../lib/useMediaQuery'
import type { SettingsPage } from '../../types'
import { ProfileSettings, SecuritySettings } from './AccountSettings'
import { AuditLogsPage } from './AuditLogsPage'
import { BillingSettings } from './BillingSettings'
import { ChannelsSettings } from './ChannelsSettings'
import IntegrationCenterPage from './IntegrationCenterPage'
import { KnowledgeSettings } from './KnowledgeSettings'
import MailSettings from './MailSettings'
import { NoPermission } from './SettingsFrame'
import { UsersSettings } from './UsersSettings'
import { WhatsAppChannelPage } from './WhatsAppChannelPage'
import { AiSettings, GeneralSettings, ServiceRulesSettings } from './WorkspaceSettings'

/**
 * Configurações em duas camadas: "Minha conta" (vale só para você) e "Área de
 * trabalho" (vale para a empresa, e só administrador e gerente mexem).
 *
 * Abaixo de 840px é uma pilha: a lista, e depois a tela escolhida em largura
 * total com "‹ Configurações". A partir de 840px a lista fica à esquerda e a
 * tela ao lado. Antes eram três colunas fixas — menu, lista e formulário —
 * espremidas em 390px, com "Verificação em 2 etapas" quebrando uma palavra por
 * linha e campo cortado à direita.
 */
function SettingsShell() {
  const { route, navigate } = useNavigation()
  const { canManage } = useSession()
  const wide = useMediaQuery(EXPANDED_QUERY)
  const page = route.page as SettingsPage
  const isIndex = page === 'settings'
  const [query, setQuery] = useState('')
  const items = settingsItems.filter((item) => !item.manage || canManage)
  const term = normalize(query.trim())
  const listed = term ? items.filter((item) => normalize(`${item.label} ${item.description}`).includes(term)) : items
  // No índice, no computador, a primeira tela da lista já abre ao lado.
  const shown: SettingsPage = isIndex ? items[0].page : page
  const activeItem = settingsItemFor(shown)
  const allowed = !activeItem?.manage || canManage

  return (
    <div className="min-h-[calc(100dvh-var(--app-bottom-nav))] expanded:grid expanded:grid-cols-[280px_minmax(0,1fr)]">
      <nav
        aria-label="Configurações"
        className={`${isIndex ? 'block' : 'hidden'} border-slate-200 bg-white expanded:sticky expanded:top-0 expanded:block expanded:h-dvh expanded:overflow-y-auto expanded:border-r`}
      >
        <div className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pt-[env(safe-area-inset-top)] backdrop-blur expanded:static expanded:border-b-0 expanded:pt-0">
          <h1 className="flex min-h-14 items-center text-lg font-semibold text-slate-900 expanded:min-h-16">Configurações</h1>
          <div className="pb-3">
            <input
              type="search"
              className="input"
              placeholder="Buscar configuração"
              aria-label="Buscar nas configurações"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </div>
        </div>
        {listed.length === 0 && <p className="px-4 py-6 text-sm text-slate-500">Nenhuma configuração com “{query.trim()}”.</p>}
        {settingsGroups.map((group) => {
          const groupItems = listed.filter((item) => item.group === group.id)
          if (groupItems.length === 0) return null
          return (
            <section key={group.id} aria-labelledby={`grupo-${group.id}`} className="pb-2">
              <div className="px-4 pb-1 pt-4">
                <h2 id={`grupo-${group.id}`} className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                  {group.label}
                </h2>
                <p className="text-xs text-slate-400">{group.hint}</p>
              </div>
              <ul className="px-2">
                {groupItems.map((item) => (
                  <li key={item.page}>
                    <NavRow
                      icon={item.icon}
                      title={item.label}
                      description={item.description}
                      active={(wide || !isIndex) && activeItem?.page === item.page}
                      onClick={() => navigate(item.page)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )
        })}
        {!canManage && (
          <p className="px-4 pb-6 pt-2 text-sm text-slate-500">As configurações da área de trabalho ficam com administradores e gerentes.</p>
        )}
      </nav>

      <div className={`${isIndex ? 'hidden' : 'block'} min-w-0 expanded:block`}>
        {allowed ? <SettingsContent page={shown} /> : <NoPermission page={shown} />}
      </div>
    </div>
  )
}

/** Busca sem acento e sem caixa: "seguranca" acha "Segurança". */
function normalize(text: string) {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

function SettingsContent({ page }: { page: SettingsPage }) {
  switch (page) {
    case 'security-settings':
      return <SecuritySettings />
    case 'workspace-settings':
      return <GeneralSettings />
    case 'users':
      return <UsersSettings />
    case 'channels':
      return <ChannelsSettings />
    case 'whatsapp-channel':
      return <WhatsAppChannelPage />
    case 'mail-settings':
      return <MailSettings />
    case 'chat-settings':
      return <ServiceRulesSettings />
    case 'integrations':
      return <IntegrationCenterPage />
    case 'ai-settings':
      return <AiSettings />
    case 'knowledge':
      return <KnowledgeSettings />
    case 'billing':
      return <BillingSettings />
    case 'audit-logs':
      return <AuditLogsPage />
    default:
      return <ProfileSettings />
  }
}

export default SettingsShell

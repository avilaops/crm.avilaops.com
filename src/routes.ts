import type { Page, Route, SettingsPage } from './types'

const defaultPath = '/'

export const pageToPath: Record<Page, string> = {
  home: '/',
  'chat-inbox': '/communications/inbox/',
  'mail-inbox': '/mail/inbox/',
  newsletter: '/mail/newsletter/',
  'team-chat': '/communications/team/',
  pipeline: '/leads/pipeline/',
  leads: '/leads/list/',
  calendar: '/calendar/',
  segments: '/segments/',
  contacts: '/lists/contacts/',
  companies: '/lists/companies/',
  'all-contacts': '/lists/all/',
  media: '/lists/media/',
  products: '/lists/products/',
  'ai-agent': '/ai-agent/',
  automations: '/automations/',
  settings: '/settings/',
  'profile-settings': '/settings/profile/',
  'security-settings': '/settings/security/',
  'workspace-settings': '/settings/general/',
  users: '/settings/users/',
  channels: '/settings/channels/',
  'whatsapp-channel': '/settings/channels/whatsapp/',
  'mail-settings': '/settings/channels/email/',
  'chat-settings': '/settings/channels/rules/',
  integrations: '/settings/integrations/',
  'ai-settings': '/settings/ai/',
  knowledge: '/settings/ai/knowledge/',
  billing: '/settings/pay/',
  'audit-logs': '/settings/audit-logs/',
}

/**
 * Endereços que mudaram de lugar quando as Configurações foram divididas em
 * "Minha conta" e "Área de trabalho". Link salvo, favorito e e-mail antigo
 * continuam chegando na tela certa.
 *
 * `/settings/` não está aqui: era "Configurações de trabalho" e virou a lista
 * de Configurações, que no computador já abre ao lado do primeiro item.
 */
export const legacyRedirects: Record<string, string> = {
  '/settings/communications/': '/settings/channels/rules/',
  '/mail/settings/': '/settings/channels/email/',
  '/settings/pipeline/leads/': '/settings/channels/',
}

/** Telas com segundo nível no endereço: `/communications/inbox/<conversa>/`. */
const pagesWithParam: Page[] = ['chat-inbox']

const settingsPages = new Set<Page>([
  'settings',
  'profile-settings',
  'security-settings',
  'workspace-settings',
  'users',
  'channels',
  'whatsapp-channel',
  'mail-settings',
  'chat-settings',
  'integrations',
  'ai-settings',
  'knowledge',
  'billing',
  'audit-logs',
])

const pathToPage = new Map<string, Page>(
  Object.entries(pageToPath).map(([page, path]) => [path, page as Page]),
)

export function isSettingsPage(page: Page): page is SettingsPage {
  return settingsPages.has(page)
}

export function normalizePath(path: string) {
  const clean = path.trim() || defaultPath
  if (clean === defaultPath) return clean
  const withSlash = clean.startsWith('/') ? clean : `/${clean}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

export type ResolvedPath = {
  route: Route
  /** O endereço que a tela de fato representa. */
  path: string
  /** Verdadeiro quando o endereço pedido não era o canônico e a barra deve ser corrigida. */
  redirected: boolean
}

export function resolvePath(rawPath: string): ResolvedPath {
  const requested = normalizePath(rawPath)
  const path = legacyRedirects[requested] ?? requested

  const page = pathToPage.get(path)
  if (page) return { route: { page }, path, redirected: path !== requested }

  for (const candidate of pagesWithParam) {
    const base = pageToPath[candidate]
    if (!path.startsWith(base)) continue
    const rest = path.slice(base.length).replace(/\/$/, '')
    if (rest && !rest.includes('/')) {
      return { route: { page: candidate, param: decodeURIComponent(rest) }, path, redirected: path !== requested }
    }
  }

  return { route: { page: 'home' }, path: defaultPath, redirected: requested !== defaultPath }
}

export function parseHash(hash: string): ResolvedPath {
  return resolvePath(hash.replace(/^#/, '') || defaultPath)
}

export function pathFor(route: Route | Page) {
  const { page, param } = typeof route === 'string' ? { page: route, param: undefined } : route
  const base = pageToPath[page] ?? defaultPath
  return param && pagesWithParam.includes(page) ? `${base}${encodeURIComponent(param)}/` : base
}

export function hashFor(route: Route | Page) {
  return `#${pathFor(route)}`
}

/**
 * Quem abre `https://crm.avilaops.com/leads/pipeline/` sem `#` recebia o
 * Início: o servidor entrega o SPA para qualquer caminho, mas a tela só lia o
 * hash. Aqui o caminho vira hash, e a barra volta para a raiz do app.
 */
export function hashFromPathname(pathname: string, basePath: string) {
  const base = normalizePath(basePath)
  const relative = pathname.startsWith(base) ? `/${pathname.slice(base.length)}` : pathname
  const path = normalizePath(relative)
  return path === defaultPath ? null : `#${path}`
}

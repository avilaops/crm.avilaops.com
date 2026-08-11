import type { Page } from './pages/CrmWorkspace'

const defaultPath = '/'

export const pageToPath: Record<Page, string> = {
  home: '/',
  'chat-inbox': '/communications/inbox/',
  'mail-inbox': '/mail/inbox/',
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
  'profile-settings': '/settings/profile/',
  'workspace-settings': '/settings/',
  'chat-settings': '/settings/communications/',
  'mail-settings': '/mail/settings/',
  billing: '/settings/pay/',
  users: '/settings/users/',
  'ai-settings': '/settings/ai/',
  knowledge: '/settings/ai/knowledge/',
  integrations: '/settings/integrations/',
  'lead-sources': '/settings/pipeline/leads/',
  channels: '/settings/channels/',
}

const pathToPage = new Map<string, Page>(
  Object.entries(pageToPath).map(([page, path]) => [path, page as Page]),
)

export function normalizePath(path: string) {
  const clean = path.trim() || defaultPath
  if (clean === defaultPath) return clean
  return clean.endsWith('/') ? clean : `${clean}/`
}

export function getPageFromHash(hash: string): Page {
  const rawPath = hash.replace(/^#/, '') || defaultPath
  return pathToPage.get(normalizePath(rawPath)) ?? 'home'
}

export function getHashForPage(page: Page) {
  return `#${pageToPath[page] ?? defaultPath}`
}

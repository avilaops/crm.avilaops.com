import { api } from './crm'

export interface GoogleCalendarEventInput {
  title: string
  description?: string
  dueAt?: string
}

export function createGoogleCalendarUrl({ title, description, dueAt }: GoogleCalendarEventInput): string {
  const baseUrl = 'https://calendar.google.com/calendar/render'
  const params = new URLSearchParams()
  params.set('action', 'TEMPLATE')
  params.set('text', title)

  if (description) {
    params.set('details', description)
  }

  if (dueAt) {
    const startDate = new Date(dueAt)
    const endDate = new Date(startDate.getTime() + 30 * 60 * 1000) // Default 30 min duration

    const formatGDate = (d: Date) => d.toISOString().replace(/-|:|\.\d\d\d/g, '')
    params.set('dates', `${formatGDate(startDate)}/${formatGDate(endDate)}`)
  }

  return `${baseUrl}?${params.toString()}`
}

export function getGoogleAuthUrl() {
  return api<{ url: string }>('/api/integrations/google/auth-url')
}

export function getGoogleIntegrationStatus() {
  return api<{ connected: boolean; email?: string }>('/api/integrations/google/status')
}

export function disconnectGoogleIntegration() {
  return api<{ ok: boolean }>('/api/integrations/google/disconnect', { method: 'POST' })
}

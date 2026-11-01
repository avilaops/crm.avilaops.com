import { api } from './crm'

export type ThreadsStatus = {
  connected: boolean
  account: { id: string | null; username: string | null; expiresAt: string | null; checkedAt: string | null } | null
  capabilities: { publish: boolean; insights: boolean }
}
export type ThreadsInsights = {
  since: string; until: string; readAt: string
  metrics: { name: string; period: string | null; total: number | null; values: { value: number; endTime: string | null }[] }[]
}
export const getThreadsStatus = () => api<ThreadsStatus>('/api/integrations/threads/status')
export const getThreadsInsights = () => api<ThreadsStatus & { insights: ThreadsInsights }>('/api/integrations/threads/insights')

import type { SessionUser } from './auth'
import { api } from './crm'

const json = { 'Content-Type': 'application/json' }

export type AccountSession = {
  id: string
  created_at: string
  last_seen_at: string
  expires_at: string
  current: boolean
}

export function getMe() {
  return api<{ user: SessionUser; hasPassword: boolean }>('/api/me')
}

export function updateMe(input: { name: string }) {
  return api<{ user: SessionUser }>('/api/me', { method: 'PATCH', headers: json, body: JSON.stringify(input) })
}

export function changePassword(input: { currentPassword: string; newPassword: string }) {
  return api<{ ok: boolean; otherSessionsClosed: number }>('/api/me/password', { method: 'POST', headers: json, body: JSON.stringify(input) })
}

export function listMySessions() {
  return api<{ sessions: AccountSession[] }>('/api/me/sessions')
}

export function revokeOtherSessions() {
  return api<{ ok: boolean; closed: number }>('/api/me/sessions/revoke-others', { method: 'POST' })
}

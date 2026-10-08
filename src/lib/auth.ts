export type SessionUser = {
  id: string
  tenant_id: string
  name: string
  email: string
  role: string
}

type SessionResponse = {
  authenticated: boolean
  user: SessionUser | null
}

async function fetchJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, {
    ...init,
    credentials: 'include',
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  })
  const data = await response.json().catch(() => null)
  if (!response.ok) {
    const message = data && typeof data === 'object' && 'error' in data ? String((data as { error: unknown }).error) : 'Erro ao comunicar com o servidor.'
    throw message
  }
  return data as T
}

export function getSession() {
  return fetchJson<SessionResponse>('/api/auth/session')
}

type SsoStatus = {
  enabled: boolean
  url: string
}

/**
 * Se o SSO esta ligado neste ambiente. Enquanto o `auth.avilaops.com` nao tiver
 * credenciais configuradas o backend responde `enabled: false` e a tela mostra
 * so o formulario de senha.
 */
export function getSsoStatus() {
  return fetchJson<SsoStatus>('/api/auth/sso/enabled')
}

export function login(email: string, password: string, tenantSlug?: string) {
  return fetchJson<SessionResponse>('/api/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password, tenantSlug: tenantSlug || undefined }),
  })
}

export function logout() {
  return fetchJson<SessionResponse>('/api/auth/logout', { method: 'POST' })
}

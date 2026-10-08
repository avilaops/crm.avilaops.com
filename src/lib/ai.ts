import { api } from './crm'

export type AiConfig = {
  provider: 'openai' | 'deepseek' | 'groq' | string
  baseUrl: string
  model: string
  hasKey: boolean
  connectedAt: string | null
}

export type AiUsage = { job: string; calls: number; inputTokens: number; outputTokens: number }

export type AiRun = {
  id: string
  job: string
  model: string
  status: 'ok' | 'error'
  input_tokens: number
  output_tokens: number
  duration_ms: number
  error: string | null
  created_at: string
}

export type AiSuggestion = {
  id: string
  entity_type: 'contact' | 'mail_sender' | string
  entity_id: string
  job: 'triagem' | 'catalogo' | string
  status: 'pending' | 'applied' | 'discarded'
  created_at: string
  payload: {
    // triagem
    categoria?: string
    pessoa?: string
    cadastrar?: boolean
    motivo?: string
    email?: string
    // catálogo
    nome?: string
    atual?: string
    confianca?: 'alta' | 'media' | 'baixa'
    // comuns
    empresa?: string
    etiquetas?: string[]
  }
}

function json(body: unknown): RequestInit {
  return { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }
}

export function getAiConfig() {
  return api<{ config: AiConfig | null; usage: AiUsage[] }>('/api/ai/config')
}

export function saveAiConfig(input: { provider: string; baseUrl?: string; model?: string; apiKey?: string }) {
  return api<{ config: AiConfig; check: { ok: boolean; detail: string } | null }>('/api/ai/config', {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function testAi() {
  return api<{ check: { ok: boolean; detail: string } }>('/api/ai/test', json({}))
}

export function listAiRuns() {
  return api<{ runs: AiRun[] }>('/api/ai/runs')
}

export function runTriagem(limit = 10) {
  return api<{ analisados: number; restantes: string }>('/api/ai/triagem', json({ limit }))
}

export function runCatalogo(limit = 10, onlyWithEmail = false) {
  return api<{ analisados: number }>('/api/ai/catalogar', json({ limit, onlyWithEmail }))
}

export function listSuggestions(job: 'triagem' | 'catalogo' | 'todos' = 'todos', status = 'pending') {
  return api<{ suggestions: AiSuggestion[] }>(`/api/ai/suggestions?job=${job}&status=${status}`)
}

export function applySuggestion(id: string) {
  return api<{ ok: true }>(`/api/ai/suggestions/${id}/apply`, json({}))
}

export function discardSuggestion(id: string) {
  return api<{ ok: true }>(`/api/ai/suggestions/${id}/discard`, json({}))
}

export function writeCampaign(briefing: string, audience?: string) {
  return api<{ subject: string; alternatives: string[]; previewText: string; body: string }>(
    '/api/ai/escrever-campanha',
    json({ briefing, audience }),
  )
}

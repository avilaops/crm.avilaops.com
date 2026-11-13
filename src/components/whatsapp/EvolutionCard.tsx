'use client'

import { useEffect, useState } from 'react'
import { QrCode, RefreshCw } from 'lucide-react'

type Status = { state: 'connected' | 'connecting' | 'disconnected'; instanceName: string; phone: string | null; qrCode?: string | null }
async function request<T>(path: string, post = false): Promise<T> {
  const response = await fetch(`/api/integrations/evolution/${path}`, { method: post ? 'POST' : 'GET', credentials: 'include', cache: 'no-store' })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'Não foi possível consultar o WhatsApp Web.')
  return data
}

export function EvolutionCard() {
  const [status, setStatus] = useState<Status | null>(null)
  const [qr, setQr] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    const refresh = () => request<Status>('status').then((next) => {
      if (!active) return
      setStatus(next); setError('')
      if (next.state === 'connected') setQr(null)
    }).catch((error: Error) => { if (active) setError(error.message) })
    void refresh()
    const timer = setInterval(() => void refresh(), 10_000)
    return () => { active = false; clearInterval(timer) }
  }, [])
  async function connect() {
    setBusy(true); setError(''); setNotice('')
    try {
      const next = await request<Status>('connect', true)
      setStatus(next); setQr(next.qrCode ?? null)
      if (next.state !== 'connected' && !next.qrCode) setNotice('A Evolution está preparando o pareamento. Aguarde e clique em atualizar QR.')
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  async function sync() {
    setBusy(true); setError('')
    try {
      const result = await request<{ imported: number; inspected: number }>('sync', true)
      setNotice(`${result.imported} mensagens de texto novas sincronizadas; ${result.inspected} registros recentes consultados.`)
    } catch (error) { setError((error as Error).message) } finally { setBusy(false) }
  }
  return <section className="grid gap-4 rounded-xl border border-slate-200 bg-white p-5" aria-labelledby="evolution-title">
    <div className="flex items-start gap-3"><QrCode className="mt-1 shrink-0 text-emerald-600" size={22} /><div><h2 id="evolution-title" className="font-semibold text-slate-900">Conecte seu WhatsApp por QR Code</h2><p className="mt-1 text-sm text-slate-500">Conecte o aparelho uma vez para toda a sua empresa. Os usuários da equipe compartilham esta conexão.</p></div></div>
    <p className="text-sm" role="status">{status?.state === 'connected' ? `Conectado${status.phone ? ` · +${status.phone}` : ''}` : status?.state === 'connecting' ? 'Aguardando leitura do QR Code' : 'Não conectado'}</p>
    {error && <p className="text-sm text-red-700" role="alert">{error}</p>}
    {notice && <p className="text-sm text-slate-600" role="status">{notice}</p>}
    {qr && <div className="grid justify-items-start gap-2"><img src={qr} alt="QR Code de pareamento do WhatsApp Web" width={260} height={260} className="max-w-full rounded-lg bg-white p-2" /><p className="text-sm text-slate-500">No celular: WhatsApp → Aparelhos conectados → Conectar aparelho. Se o código expirar, atualize o QR.</p></div>}
    <div className="flex flex-wrap gap-2">
      <button type="button" onClick={() => void connect()} disabled={busy} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-emerald-700 px-4 text-sm font-semibold text-white disabled:opacity-50"><RefreshCw size={16} />{status?.state === 'connected' ? 'Verificar conexão' : qr ? 'Atualizar QR' : 'Conectar WhatsApp Web'}</button>
      {status?.state === 'connected' && <button type="button" onClick={() => void sync()} disabled={busy} className="min-h-11 rounded-lg border border-slate-300 px-4 text-sm font-medium disabled:opacity-50">Sincronizar mensagens</button>}
    </div>
    <p className="text-xs leading-5 text-slate-500">Conexão por aparelho vinculado, separada da API oficial da Meta. Esta sincronização importa as mensagens recentes de texto; anexos e grupos não são importados por este conector.</p>
  </section>
}

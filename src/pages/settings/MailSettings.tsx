import { useEffect, useState } from 'react'
import { getMailAccount, saveMailAccount, testMailAccount, type MailCheck } from '../../lib/mail'

type Form = {
  imapHost: string
  imapPort: number
  smtpHost: string
  smtpPort: number
  user: string
  password: string
  fromName: string
  fromEmail: string
}

const DEFAULTS: Form = {
  imapHost: 'imap.porkbun.com',
  imapPort: 993,
  smtpHost: 'smtp.porkbun.com',
  smtpPort: 587,
  user: 'nicolas@avilaops.com',
  password: '',
  fromName: 'Ávila Ops',
  fromEmail: 'nicolas@avilaops.com',
}

function CheckLine({ label, result }: { label: string; result: { ok: boolean; detail: string } }) {
  return (
    <p className={`text-sm ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
      <strong>{label}:</strong> {result.ok ? 'conectado' : 'falhou'} — {result.detail || 'sem detalhe'}
    </p>
  )
}

/**
 * Conta de e-mail da operação, cadastrada pela tela.
 *
 * A senha só sobe: ela nunca volta para o navegador. Deixar o campo em branco
 * ao salvar mantém a senha atual — é o caminho de quem só mudou a porta ou o
 * nome do remetente.
 */
function MailSettings() {
  const [form, setForm] = useState<Form>(DEFAULTS)
  const [check, setCheck] = useState<MailCheck | null>(null)
  const [hasPassword, setHasPassword] = useState(false)
  const [lastError, setLastError] = useState<string | null>(null)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  useEffect(() => {
    getMailAccount()
      .then(({ account }) => {
        if (!account) return
        setForm({ ...DEFAULTS, ...account, password: '' })
        setHasPassword(account.hasPassword)
        setLastError(account.lastError)
      })
      .catch((caught: Error) => setError(caught.message))
  }, [])

  async function save() {
    setBusy('save')
    try {
      const result = await saveMailAccount({ ...form, password: form.password || undefined })
      setHasPassword(result.account.hasPassword)
      setCheck(result.check)
      setForm((current) => ({ ...current, password: '' }))
      setMessage('Conta salva.')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar.')
    } finally {
      setBusy('')
    }
  }

  async function test() {
    setBusy('test')
    try {
      const result = await testMailAccount()
      setCheck(result.check)
      setMessage('')
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível testar.')
    } finally {
      setBusy('')
    }
  }

  const fields: [keyof Form, string, string][] = [
    ['user', 'Usuário (e-mail da caixa)', 'nicolas@avilaops.com'],
    ['password', hasPassword ? 'Senha (deixe em branco para manter)' : 'Senha da caixa', '••••••••'],
    ['imapHost', 'Servidor IMAP (leitura)', 'imap.porkbun.com'],
    ['imapPort', 'Porta IMAP', '993'],
    ['smtpHost', 'Servidor SMTP (envio)', 'smtp.porkbun.com'],
    ['smtpPort', 'Porta SMTP', '587'],
    ['fromName', 'Nome do remetente', 'Ávila Ops'],
    ['fromEmail', 'E-mail do remetente', 'nicolas@avilaops.com'],
  ]

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold">Conta de e-mail</h3>
        <p className="text-sm text-slate-500">
          A mesma conta lê a caixa de entrada e envia as campanhas da newsletter. A senha fica criptografada no banco.
        </p>
      </div>

      {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}
      {lastError && !check && (
        <p className="rounded border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          Última falha registrada: {lastError}
        </p>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        {fields.map(([field, label, placeholder]) => (
          <label key={field} className="text-sm">
            <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
            <input
              className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
              type={field === 'password' ? 'password' : field.endsWith('Port') ? 'number' : 'text'}
              value={String(form[field] ?? '')}
              placeholder={placeholder}
              autoComplete={field === 'password' ? 'new-password' : 'off'}
              onChange={(event) =>
                setForm({ ...form, [field]: field.endsWith('Port') ? Number(event.target.value) : event.target.value })
              }
            />
          </label>
        ))}
      </div>

      <div className="flex flex-wrap gap-3">
        <button
          className="rounded bg-slate-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          onClick={() => void save()}
          disabled={busy === 'save'}
        >
          {busy === 'save' ? 'Salvando…' : 'Salvar e testar'}
        </button>
        <button
          className="rounded border border-slate-200 px-4 py-2 text-sm disabled:opacity-50"
          onClick={() => void test()}
          disabled={busy === 'test' || !hasPassword}
        >
          {busy === 'test' ? 'Testando…' : 'Testar conexão'}
        </button>
      </div>

      {check && (
        <div className="space-y-1 rounded border border-slate-200 bg-white p-4">
          <CheckLine label="IMAP (ler)" result={check.imap} />
          <CheckLine label="SMTP (enviar)" result={check.smtp} />
        </div>
      )}
    </div>
  )
}

export default MailSettings

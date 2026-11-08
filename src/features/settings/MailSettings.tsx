import { useEffect, useState, type FormEvent } from 'react'
import { FormField, FormSection, Notice } from '../../components/ui/Form'
import { getMailAccount, saveMailAccount, testMailAccount, type MailCheck } from '../../lib/mail'
import { buttonClass } from '../../lib/ui'
import { SettingsFrame } from './SettingsFrame'

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

/**
 * Valores iniciais neutros. Antes o formulário vinha preenchido com a caixa e o
 * provedor da própria Ávila Ops — qualquer empresa nova via o e-mail de outra
 * pessoa ali e, se salvasse sem olhar, tentava entrar na caixa errada.
 */
const DEFAULTS: Form = {
  imapHost: '',
  imapPort: 993,
  smtpHost: '',
  smtpPort: 587,
  user: '',
  password: '',
  fromName: '',
  fromEmail: '',
}

function CheckLine({ label, result }: { label: string; result: { ok: boolean; detail: string } }) {
  return (
    <p className={`text-sm ${result.ok ? 'text-emerald-700' : 'text-red-700'}`}>
      <strong>{label}:</strong> {result.ok ? 'conectado' : 'falhou'} — {result.detail || 'sem detalhe'}
    </p>
  )
}

/**
 * Canais › E-mail: a conta que lê a caixa de entrada e envia a newsletter.
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

  async function save(event: FormEvent) {
    event.preventDefault()
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

  const set = (field: keyof Form) => (event: { target: { value: string } }) =>
    setForm((current) => ({ ...current, [field]: field.endsWith('Port') ? Number(event.target.value) : event.target.value }))

  return (
    <SettingsFrame
      page="mail-settings"
      title="E-mail"
      description="A mesma conta lê a caixa de entrada e envia as campanhas da newsletter. A senha fica criptografada no servidor."
    >
      <form onSubmit={save} className="space-y-5">
        {error && <Notice tone="danger">{error}</Notice>}
        {message && <Notice tone="success">{message}</Notice>}
        {lastError && !check && <Notice tone="warning">Última falha registrada: {lastError}</Notice>}

        <FormSection title="Caixa de e-mail">
          <FormField label="Usuário (e-mail da caixa)">
            <input className="input" inputMode="email" autoCapitalize="none" autoComplete="off" spellCheck={false} placeholder="contato@suaempresa.com.br" value={form.user} onChange={set('user')} required />
          </FormField>
          <FormField label={hasPassword ? 'Senha (em branco mantém a atual)' : 'Senha da caixa'}>
            <input className="input" type="password" autoComplete="new-password" placeholder="••••••••" value={form.password} onChange={set('password')} required={!hasPassword} />
          </FormField>
        </FormSection>

        <FormSection title="Servidores" description="Estão no painel do seu provedor de e-mail, em configuração de IMAP e SMTP.">
          <div className="grid grid-cols-[minmax(0,1fr)_6.5rem] gap-3">
            <FormField label="Servidor de leitura (IMAP)">
              <input className="input" autoCapitalize="none" placeholder="imap.seudominio.com.br" value={form.imapHost} onChange={set('imapHost')} required />
            </FormField>
            <FormField label="Porta">
              <input className="input" type="number" inputMode="numeric" value={form.imapPort} onChange={set('imapPort')} required />
            </FormField>
            <FormField label="Servidor de envio (SMTP)">
              <input className="input" autoCapitalize="none" placeholder="smtp.seudominio.com.br" value={form.smtpHost} onChange={set('smtpHost')} required />
            </FormField>
            <FormField label="Porta">
              <input className="input" type="number" inputMode="numeric" value={form.smtpPort} onChange={set('smtpPort')} required />
            </FormField>
          </div>
        </FormSection>

        <FormSection title="Remetente" description="Como seus contatos veem as mensagens que saem do CRM.">
          <div className="grid gap-4 medium:grid-cols-2">
            <FormField label="Nome">
              <input className="input" placeholder="Nome da empresa" value={form.fromName} onChange={set('fromName')} />
            </FormField>
            <FormField label="E-mail">
              <input className="input" type="email" inputMode="email" autoCapitalize="none" placeholder="contato@suaempresa.com.br" value={form.fromEmail} onChange={set('fromEmail')} />
            </FormField>
          </div>
        </FormSection>

        <div className="flex flex-wrap gap-3">
          <button type="submit" className={buttonClass.primary} disabled={busy === 'save'}>
            {busy === 'save' ? 'Salvando…' : 'Salvar e testar'}
          </button>
          <button type="button" className={buttonClass.secondary} onClick={() => void test()} disabled={busy === 'test' || !hasPassword}>
            {busy === 'test' ? 'Testando…' : 'Testar conexão'}
          </button>
        </div>

        {check && (
          <div className="space-y-1 rounded-xl border border-slate-200 bg-white p-4">
            <CheckLine label="IMAP (ler)" result={check.imap} />
            <CheckLine label="SMTP (enviar)" result={check.smtp} />
          </div>
        )}
      </form>
    </SettingsFrame>
  )
}

export default MailSettings

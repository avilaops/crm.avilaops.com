import { useCallback, useEffect, useState } from 'react'
import { Mail, RefreshCw, UserPlus, X } from 'lucide-react'
import {
  ignoreSender,
  listMailMessages,
  listMailSenders,
  readMailMessage,
  registerSenderAsContact,
  type MailMessage,
  type MailSender,
} from '../../lib/mail'
import Topbar from '../../components/layout/Topbar'

type ContactForm = { name: string; company: string; phone: string; tags: string }

const PAGINA = 40

function formatDate(value: string | null) {
  if (!value) return '-'
  return new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

/**
 * Caixa de entrada real da conta configurada em Configurações de email.
 *
 * A tela existe para duas coisas: ler o que chegou e transformar remetente em
 * contato do CRM sem digitar de novo. Por isso a coluna da direita é o
 * cadastro, não um preview bonito.
 */
function MailInbox() {
  const [messages, setMessages] = useState<MailMessage[]>([])
  const [senders, setSenders] = useState<MailSender[]>([])
  const [selected, setSelected] = useState<{ message: MailMessage; text: string; html: string | null } | null>(null)
  const [registering, setRegistering] = useState<MailSender | null>(null)
  const [form, setForm] = useState<ContactForm>({ name: '', company: '', phone: '', tags: 'clientes' })
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState('')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [offset, setOffset] = useState(0)
  const [totalCaixa, setTotalCaixa] = useState(0)
  const [verHtml, setVerHtml] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const [inbox, senderList] = await Promise.all([
        listMailMessages({ limit: PAGINA, offset }),
        listMailSenders('new'),
      ])
      setMessages(inbox.messages)
      setTotalCaixa(inbox.total)
      setSenders(senderList.senders)
      setError('')
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao carregar a caixa.')
    } finally {
      setLoading(false)
    }
  }, [offset])

  useEffect(() => {
    void load()
  }, [load])

  async function openMessage(uid: number) {
    setBusy(`msg-${uid}`)
    try {
      setSelected(await readMailMessage(uid))
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao abrir a mensagem.')
    } finally {
      setBusy('')
    }
  }

  function startRegistration(sender: MailSender) {
    setRegistering(sender)
    setForm({
      name: sender.name ?? sender.email.split('@')[0],
      company: sender.email.split('@')[1]?.replace(/\.(com|com\.br|net|org)(\.br)?$/, '') ?? '',
      phone: '',
      tags: 'clientes',
    })
  }

  async function confirmRegistration() {
    if (!registering) return
    setBusy('register')
    try {
      await registerSenderAsContact(registering.id, {
        name: form.name.trim(),
        company: form.company.trim(),
        phone: form.phone.trim(),
        tags: form.tags.split(',').map((tag) => tag.trim().toLowerCase()).filter(Boolean),
      })
      setMessage(`${registering.email} virou contato.`)
      setRegistering(null)
      await load()
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Falha ao cadastrar o contato.')
    } finally {
      setBusy('')
    }
  }

  async function skip(sender: MailSender) {
    setBusy(sender.id)
    try {
      await ignoreSender(sender.id)
      setSenders((current) => current.filter((item) => item.id !== sender.id))
    } finally {
      setBusy('')
    }
  }

  return (
    <div>
      <Topbar title="Caixa de entrada" tab={`${messages.length} mensagem(ns)`} />
      <div className="space-y-4 p-5">
        <div className="flex flex-wrap items-center gap-3">
          <button
            className="flex items-center gap-2 rounded bg-slate-900 px-3 py-2 text-sm font-medium text-white disabled:opacity-50"
            onClick={() => void load()}
            disabled={loading}
          >
            <RefreshCw size={14} /> {loading ? 'Carregando…' : 'Atualizar'}
          </button>
          <span className="text-sm text-slate-500">{senders.length} remetente(s) esperando cadastro</span>
          <div className="ml-auto flex items-center gap-2 text-xs text-slate-500">
            <button
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              disabled={offset === 0 || loading}
              onClick={() => setOffset((atual) => Math.max(atual - PAGINA, 0))}
            >
              Mais recentes
            </button>
            <span>
              {totalCaixa === 0 ? '—' : `${offset + 1}–${Math.min(offset + PAGINA, totalCaixa)} de ${totalCaixa}`}
            </span>
            <button
              className="rounded border border-slate-200 px-3 py-1 disabled:opacity-40"
              disabled={offset + PAGINA >= totalCaixa || loading}
              onClick={() => setOffset((atual) => atual + PAGINA)}
            >
              Mais antigas
            </button>
          </div>
        </div>

        {error && <p className="rounded border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>}
        {message && <p className="rounded border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{message}</p>}

        {senders.length > 0 && (
          <section className="rounded border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">
              Quem escreveu e ainda não é contato
            </header>
            <div className="divide-y divide-slate-100">
              {senders.map((sender) => (
                <div key={sender.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{sender.name || sender.email}</p>
                    <p className="truncate text-xs text-slate-500">
                      {sender.email} · {sender.message_count} mensagem(ns) · {formatDate(sender.last_seen_at)}
                    </p>
                    {sender.last_subject && <p className="truncate text-xs text-slate-400">{sender.last_subject}</p>}
                  </div>
                  <button
                    className="flex items-center gap-2 rounded bg-blue-600 px-3 py-1.5 text-xs font-medium text-white"
                    onClick={() => startRegistration(sender)}
                  >
                    <UserPlus size={14} /> Cadastrar
                  </button>
                  <button
                    className="rounded border border-slate-200 px-3 py-1.5 text-xs text-slate-600 disabled:opacity-50"
                    onClick={() => void skip(sender)}
                    disabled={busy === sender.id}
                  >
                    Ignorar
                  </button>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <section className="overflow-hidden rounded border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">Mensagens</header>
            {loading && <p className="p-4 text-sm text-slate-400">Carregando…</p>}
            {!loading && messages.length === 0 && (
              <p className="p-4 text-sm text-slate-500">
                Nenhuma mensagem. Se a conta ainda não foi configurada, abra Configurações de email.
              </p>
            )}
            <div className="max-h-[60vh] divide-y divide-slate-100 overflow-auto">
              {messages.map((item) => (
                <button
                  key={item.uid}
                  className={`block w-full px-4 py-3 text-left hover:bg-slate-50 ${selected?.message.uid === item.uid ? 'bg-blue-50' : ''}`}
                  onClick={() => void openMessage(item.uid)}
                  disabled={busy === `msg-${item.uid}`}
                >
                  <p className="truncate text-sm font-medium">{item.fromName || item.fromEmail}</p>
                  <p className="truncate text-sm text-slate-600">{item.subject}</p>
                  <p className="text-xs text-slate-400">{formatDate(item.date)}</p>
                </button>
              ))}
            </div>
          </section>

          <section className="overflow-hidden rounded border border-slate-200 bg-white">
            <header className="border-b border-slate-200 px-4 py-3 text-xs font-bold uppercase text-slate-500">Mensagem</header>
            {!selected ? (
              <div className="grid place-items-center gap-2 p-10 text-center text-slate-400">
                <Mail size={28} />
                <p className="text-sm">Escolha uma mensagem para ler aqui.</p>
              </div>
            ) : (
              <div className="max-h-[60vh] space-y-3 overflow-auto p-4">
                <div className="flex flex-wrap items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{selected.message.subject}</p>
                    <p className="text-xs text-slate-500">
                      {selected.message.fromName} &lt;{selected.message.fromEmail}&gt; · {formatDate(selected.message.date)}
                    </p>
                  </div>
                  {selected.html && (
                    <button
                      className="rounded border border-slate-200 px-3 py-1 text-xs text-slate-600"
                      onClick={() => setVerHtml((atual) => !atual)}
                    >
                      {verHtml ? 'Ver texto' : 'Ver HTML'}
                    </button>
                  )}
                </div>
                {verHtml && selected.html ? (
                  // sandbox vazio: e-mail de terceiro não roda script nem carrega
                  // rastreador dentro do CRM.
                  <iframe title="Mensagem em HTML" className="h-96 w-full rounded border border-slate-200 bg-white" srcDoc={selected.html} sandbox="" />
                ) : (
                  <pre className="whitespace-pre-wrap break-words text-sm text-slate-700">{selected.text || '(sem texto)'}</pre>
                )}
              </div>
            )}
          </section>
        </div>
      </div>

      {registering && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="mb-4 flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase text-slate-400">Novo contato</p>
                <h3 className="text-lg font-semibold">{registering.email}</h3>
              </div>
              <button className="text-slate-400" onClick={() => setRegistering(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="space-y-3">
              {(
                [
                  ['Nome', 'name', 'Como essa pessoa assina'],
                  ['Empresa', 'company', 'Empresa dela'],
                  ['Telefone', 'phone', 'Opcional'],
                  ['Etiquetas', 'tags', 'clientes, prospeccao'],
                ] as const
              ).map(([label, field, placeholder]) => (
                <label key={field} className="block text-sm">
                  <span className="mb-1 block text-xs font-medium text-slate-500">{label}</span>
                  <input
                    className="w-full rounded border border-slate-200 px-3 py-2 text-sm outline-none focus:border-blue-400"
                    value={form[field]}
                    placeholder={placeholder}
                    onChange={(event) => setForm({ ...form, [field]: event.target.value })}
                  />
                </label>
              ))}
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-slate-200 px-4 py-2 text-sm" onClick={() => setRegistering(null)}>
                Cancelar
              </button>
              <button
                className="rounded bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                onClick={() => void confirmRegistration()}
                disabled={busy === 'register' || !form.name.trim()}
              >
                {busy === 'register' ? 'Salvando…' : 'Cadastrar contato'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export default MailInbox

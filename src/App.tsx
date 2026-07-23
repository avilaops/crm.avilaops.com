import {
  AtSign,
  CheckCircle2,
  FileUp,
  Mail,
  MessageCircle,
  Plus,
  Save,
  Search,
  Trash2,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react'

type Contact = {
  id: string
  name: string
  email: string
  phone: string
  company: string
  role: string
  category: string
  notes: string
  createdAt: string
  updatedAt: string
}

type ContactInput = Omit<Contact, 'id' | 'createdAt' | 'updatedAt'> & { id: string | null }

type WhatsAppSettings = {
  providerName: string
  clientId: string
  authorizationUrl: string
  redirectUri: string
  scope: string
  connected: boolean
  connectedAt: string | null
}

const contactsStorageKey = 'agenda-contatos:web:contacts'
const settingsStorageKey = 'agenda-contatos:web:whatsapp-settings'

const emptyContact: ContactInput = {
  id: null,
  name: '',
  email: '',
  phone: '',
  company: '',
  role: '',
  category: 'Cliente',
  notes: '',
}

const defaultSettings: WhatsAppSettings = {
  providerName: 'Provedor OAuth2',
  clientId: '',
  authorizationUrl: '',
  redirectUri: `${window.location.origin}/auth/whatsapp/callback`,
  scope: 'whatsapp_business_messaging whatsapp_business_management',
  connected: false,
  connectedAt: null,
}

const categories = ['Cliente', 'Fornecedor', 'Parceiro', 'Lead', 'Interno', 'Importado']

function initials(name: string) {
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('')
}

function normalizePhone(value: string) {
  return value.replace(/\D/g, '')
}

function decodeVcardValue(value: string) {
  return value
    .replace(/\\n/gi, '\n')
    .replace(/\\,/g, ',')
    .replace(/\\;/g, ';')
    .replace(/\\\\/g, '\\')
    .trim()
}

function unfoldVcardLines(content: string) {
  const lines: string[] = []
  for (const rawLine of content.split(/\r?\n/)) {
    if (/^[ \t]/.test(rawLine) && lines.length > 0) {
      lines[lines.length - 1] += rawLine.trimStart()
    } else {
      lines.push(rawLine)
    }
  }
  return lines
}

function nameFromStructured(value: string) {
  const [family = '', given = ''] = value.split(';')
  return `${given.trim()} ${family.trim()}`.trim() || value.replace(/;/g, ' ').trim()
}

function parseVcf(content: string): ContactInput[] {
  const contacts: ContactInput[] = []
  let current: ContactInput | null = null

  for (const line of unfoldVcardLines(content)) {
    const upper = line.trim().toUpperCase()
    if (upper === 'BEGIN:VCARD') {
      current = { ...emptyContact, category: 'Importado' }
      continue
    }
    if (upper === 'END:VCARD') {
      if (current) contacts.push(current)
      current = null
      continue
    }
    if (!current || !line.includes(':')) continue

    const [rawKey, ...valueParts] = line.split(':')
    const key = rawKey.split(';')[0].trim().toUpperCase()
    const value = decodeVcardValue(valueParts.join(':'))

    if (key === 'FN' && !current.name) current.name = value
    if (key === 'N' && !current.name) current.name = nameFromStructured(value)
    if (key === 'EMAIL' && !current.email) current.email = value
    if (key === 'TEL' && !current.phone) current.phone = value
    if (key === 'ORG' && !current.company) current.company = value.replace(/;/g, ' ')
    if (key === 'TITLE' && !current.role) current.role = value
    if (key === 'NOTE' && !current.notes) current.notes = value
  }

  return contacts
}

function sortContacts(contacts: Contact[]) {
  return [...contacts].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'))
}

function App() {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [contacts, setContacts] = useState<Contact[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [draft, setDraft] = useState<ContactInput>(emptyContact)
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState('Carregando agenda...')
  const [settings, setSettings] = useState<WhatsAppSettings>(defaultSettings)

  useEffect(() => {
    const savedContacts = JSON.parse(localStorage.getItem(contactsStorageKey) || '[]') as Contact[]
    const savedSettings = JSON.parse(
      localStorage.getItem(settingsStorageKey) || JSON.stringify(defaultSettings),
    ) as WhatsAppSettings
    setContacts(sortContacts(savedContacts))
    setSettings({ ...defaultSettings, ...savedSettings })
    setStatus(`${savedContacts.length} contatos na agenda`)
  }, [])

  useEffect(() => {
    localStorage.setItem(contactsStorageKey, JSON.stringify(contacts))
  }, [contacts])

  useEffect(() => {
    localStorage.setItem(settingsStorageKey, JSON.stringify(settings))
  }, [settings])

  const filteredContacts = useMemo(() => {
    const term = query.trim().toLowerCase()
    if (!term) return contacts
    return contacts.filter((contact) =>
      [contact.name, contact.email, contact.phone, contact.company, contact.category]
        .join(' ')
        .toLowerCase()
        .includes(term),
    )
  }, [contacts, query])

  const selectedContact = contacts.find((contact) => contact.id === selectedId)

  function selectContact(contact: Contact) {
    setSelectedId(contact.id)
    setDraft({ ...contact, id: contact.id })
  }

  function newContact() {
    setSelectedId(null)
    setDraft(emptyContact)
  }

  function saveContact(event: FormEvent) {
    event.preventDefault()
    if (!draft.name.trim()) {
      setStatus('Informe o nome do contato')
      return
    }
    if (!draft.email.trim() && !draft.phone.trim()) {
      setStatus('Informe email ou telefone')
      return
    }

    const now = new Date().toISOString()
    const saved: Contact = {
      ...draft,
      id: draft.id || `contact-${Date.now()}`,
      name: draft.name.trim(),
      email: draft.email.trim().toLowerCase(),
      phone: draft.phone.trim(),
      company: draft.company.trim(),
      role: draft.role.trim(),
      category: draft.category,
      notes: draft.notes.trim(),
      createdAt: now,
      updatedAt: now,
    }

    setContacts((current) =>
      sortContacts(
        current.some((contact) => contact.id === saved.id)
          ? current.map((contact) => (contact.id === saved.id ? saved : contact))
          : [...current, saved],
      ),
    )
    setSelectedId(saved.id)
    setDraft({ ...saved, id: saved.id })
    setStatus(`Contato salvo: ${saved.name}`)
  }

  function deleteSelected() {
    if (!selectedId) return
    setContacts((current) => current.filter((contact) => contact.id !== selectedId))
    newContact()
    setStatus('Contato removido')
  }

  async function importVcf(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return

    const content = await file.text()
    const existingEmails = new Set(contacts.map((contact) => contact.email).filter(Boolean))
    const existingPhones = new Set(contacts.map((contact) => normalizePhone(contact.phone)).filter(Boolean))
    let imported = 0
    let skipped = 0

    const importedContacts = parseVcf(content).flatMap((input) => {
      if (!input.name.trim() || (!input.email.trim() && !input.phone.trim())) {
        skipped += 1
        return []
      }

      const email = input.email.trim().toLowerCase()
      const phone = normalizePhone(input.phone)
      if ((email && existingEmails.has(email)) || (phone && existingPhones.has(phone))) {
        skipped += 1
        return []
      }

      const now = new Date().toISOString()
      imported += 1
      if (email) existingEmails.add(email)
      if (phone) existingPhones.add(phone)
      return [{
        ...input,
        id: `contact-${Date.now()}-${imported}`,
        email,
        createdAt: now,
        updatedAt: now,
      }]
    })

    setContacts((current) => sortContacts([...current, ...importedContacts]))
    setSelectedId(null)
    setDraft(emptyContact)
    setStatus(`${imported} contatos importados, ${skipped} ignorados`)
    event.target.value = ''
  }

  function sendEmail(contact: Contact) {
    window.location.href = `mailto:${contact.email}?subject=${encodeURIComponent(
      'Contato via Agenda Ávila Ops',
    )}`
  }

  function openWhatsApp(contact: Contact) {
    const phone = normalizePhone(contact.phone)
    const text = encodeURIComponent(`Olá ${contact.name}, tudo bem?`)
    window.open(`https://wa.me/${phone}?text=${text}`, '_blank')
  }

  function connectWhatsApp() {
    if (!settings.authorizationUrl.trim() || !settings.clientId.trim()) {
      setStatus('Configure a URL de autorização e o Client ID do provedor')
      return
    }
    const separator = settings.authorizationUrl.includes('?') ? '&' : '?'
    const url = `${settings.authorizationUrl}${separator}client_id=${encodeURIComponent(
      settings.clientId,
    )}&redirect_uri=${encodeURIComponent(settings.redirectUri)}&response_type=code&scope=${encodeURIComponent(
      settings.scope,
    )}`
    window.open(url, '_blank')
    setSettings({ ...settings, connected: true, connectedAt: new Date().toISOString() })
    setStatus('Fluxo OAuth2 iniciado')
  }

  return (
    <main className="min-h-screen bg-slate-50 text-slate-950">
      <div className="grid min-h-screen lg:grid-cols-[240px_minmax(0,1fr)] 2xl:grid-cols-[260px_minmax(0,1fr)_340px]">
        <aside className="border-r border-slate-200 bg-white">
          <div className="border-b border-slate-200 p-5">
            <div className="flex items-center gap-3">
              <div className="grid h-10 w-10 place-items-center rounded-md bg-emerald-600 text-white">
                <AtSign size={20} />
              </div>
              <div className="min-w-0">
                <h1 className="truncate text-lg font-semibold">Agenda Contatos</h1>
                <p className="truncate text-sm text-slate-500">Ávila Ops Tecnologia</p>
              </div>
            </div>
            <button className="mt-5 w-full rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" onClick={newContact}>
              <Plus className="mr-2 inline" size={16} />
              Novo contato
            </button>
            <button className="mt-2 w-full rounded-md border border-slate-200 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" onClick={() => fileInputRef.current?.click()}>
              <FileUp className="mr-2 inline" size={16} />
              Importar VCF
            </button>
            <input ref={fileInputRef} className="hidden" type="file" accept=".vcf,.vcard,text/vcard" onChange={importVcf} />
          </div>

          <nav className="space-y-1 p-3 text-sm">
            {categories.map((category) => (
              <button key={category} className="flex w-full items-center justify-between rounded-md px-3 py-2 text-left hover:bg-slate-100">
                <span>{category}</span>
                <span className="text-slate-400">{contacts.filter((contact) => contact.category === category).length}</span>
              </button>
            ))}
          </nav>
        </aside>

        <section className="flex min-w-0 flex-col">
          <header className="border-b border-slate-200 bg-white px-6 py-4">
            <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
              <div className="min-w-0">
                <h2 className="text-xl font-semibold">Contatos</h2>
                <p className="text-sm text-slate-500">{status}</p>
              </div>
              <div className="relative w-full xl:w-80">
                <Search className="absolute left-3 top-2.5 text-slate-400" size={17} />
                <input
                  className="w-full rounded-md border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm outline-none focus:border-emerald-600"
                  placeholder="Buscar nome, email, empresa..."
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                />
              </div>
            </div>
          </header>

          <div className="grid min-w-0 gap-5 overflow-auto p-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="overflow-hidden rounded-md border border-slate-200 bg-white">
              <div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-slate-100 px-4 py-3 text-xs font-semibold uppercase text-slate-500">
                <span>Contato</span>
                <span>Categoria</span>
              </div>
              {filteredContacts.map((contact) => (
                <button
                  key={contact.id}
                  className={`flex w-full min-w-0 items-center gap-3 border-b border-slate-100 px-4 py-3 text-left text-sm hover:bg-emerald-50 ${
                    selectedId === contact.id ? 'bg-emerald-50' : ''
                  }`}
                  onClick={() => selectContact(contact)}
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-slate-200 text-xs font-semibold">
                    {initials(contact.name)}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium">{contact.name}</span>
                    <span className="mt-0.5 flex min-w-0 flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span className="max-w-full truncate">{contact.email || 'Sem email'}</span>
                      <span className="max-w-full truncate">{contact.phone || 'Sem telefone'}</span>
                      {(contact.company || contact.role) && (
                        <span className="max-w-full truncate">{contact.company || contact.role}</span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-600">
                    {contact.category}
                  </span>
                </button>
              ))}
              {filteredContacts.length === 0 && (
                <div className="grid place-items-center px-4 py-16 text-sm text-slate-500">Nenhum contato encontrado</div>
              )}
            </div>

            <div className="rounded-md border border-slate-200 bg-white p-4">
              <h3 className="mb-3 text-sm font-semibold">Ações rápidas</h3>
              {selectedContact ? (
                <div className="space-y-2">
                  <button className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedContact.email} onClick={() => sendEmail(selectedContact)}>
                    <Mail className="mr-2 inline" size={16} />
                    Enviar email
                  </button>
                  <button className="w-full rounded-md border border-slate-200 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40" disabled={!selectedContact.phone} onClick={() => openWhatsApp(selectedContact)}>
                    <MessageCircle className="mr-2 inline" size={16} />
                    Abrir WhatsApp
                  </button>
                </div>
              ) : (
                <p className="text-sm text-slate-500">Selecione um contato para usar email e WhatsApp.</p>
              )}

              <div className="mt-6 border-t border-slate-200 pt-4">
                <h3 className="mb-3 text-sm font-semibold">WhatsApp OAuth2</h3>
                <div className="space-y-3">
                  <input className="input" placeholder="Nome do provedor" value={settings.providerName} onChange={(event) => setSettings({ ...settings, providerName: event.target.value })} />
                  <input className="input" placeholder="Client ID" value={settings.clientId} onChange={(event) => setSettings({ ...settings, clientId: event.target.value })} />
                  <input className="input" placeholder="URL de autorização" value={settings.authorizationUrl} onChange={(event) => setSettings({ ...settings, authorizationUrl: event.target.value })} />
                  <button className="w-full rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white" onClick={connectWhatsApp}>
                    <CheckCircle2 className="mr-2 inline" size={16} />
                    {settings.connected ? 'Reconectar OAuth2' : 'Conectar OAuth2'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        <aside className="border-l border-slate-200 bg-white lg:col-span-2 2xl:col-span-1">
          <form className="flex h-full flex-col" onSubmit={saveContact}>
            <div className="border-b border-slate-200 p-5">
              <h2 className="text-lg font-semibold">{draft.id ? 'Editar contato' : 'Novo contato'}</h2>
              <p className="text-sm text-slate-500">Dados comerciais e canais de contato</p>
            </div>
            <div className="grid gap-4 overflow-auto p-5 md:grid-cols-2 2xl:block 2xl:space-y-4">
              <label className="field">
                <span>Nome</span>
                <input className="input" value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} required />
              </label>
              <label className="field">
                <span>Email</span>
                <input className="input" type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} />
              </label>
              <label className="field">
                <span>Telefone / WhatsApp</span>
                <input className="input" value={draft.phone} onChange={(event) => setDraft({ ...draft, phone: event.target.value })} />
              </label>
              <label className="field">
                <span>Empresa</span>
                <input className="input" value={draft.company} onChange={(event) => setDraft({ ...draft, company: event.target.value })} />
              </label>
              <label className="field">
                <span>Cargo</span>
                <input className="input" value={draft.role} onChange={(event) => setDraft({ ...draft, role: event.target.value })} />
              </label>
              <label className="field">
                <span>Categoria</span>
                <select className="input" value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="field md:col-span-2 2xl:col-span-1">
                <span>Observações</span>
                <textarea className="input min-h-28 resize-none" value={draft.notes} onChange={(event) => setDraft({ ...draft, notes: event.target.value })} />
              </label>
            </div>
            <div className="flex gap-2 border-t border-slate-200 p-5">
              <button className="flex-1 rounded-md bg-slate-950 px-3 py-2 text-sm font-medium text-white" type="submit">
                <Save className="mr-2 inline" size={16} />
                Salvar
              </button>
              <button className="rounded-md border border-red-200 px-3 py-2 text-red-700 disabled:opacity-40" type="button" disabled={!selectedId} onClick={deleteSelected}>
                <Trash2 size={16} />
              </button>
            </div>
          </form>
        </aside>
      </div>
    </main>
  )
}

export default App

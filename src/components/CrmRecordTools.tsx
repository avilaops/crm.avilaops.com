import { useEffect, useState, type FormEvent } from 'react'
import { api, listUsers, listContacts, listCompanies, listLeads, listConversations, createTask, updateTask, type CrmTask } from '../lib/crm'

const input = 'mt-1 w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm'
type Option = { id: string; name?: string; title?: string; contact_name?: string | null }

export function RelationSelect({ label, value, options, onChange }: { label: string; value: string; options: Option[]; onChange: (value: string) => void }) {
  return <label className="block text-sm text-slate-600">{label}<select className={input} value={value} onChange={e => onChange(e.target.value)}><option value="">Sem vínculo</option>{value&&!options.some(o=>o.id===value)&&<option value={value}>Vínculo atual</option>}{options.map(o => <option key={o.id} value={o.id}>{o.name ?? o.title ?? o.contact_name ?? o.id}</option>)}</select></label>
}

export function RecordRelations({ kind, id, initial, onSaved }: { kind: 'contacts' | 'leads'; id: string; initial: { assigned_user_id?: string | null; company_id?: string | null; contact_id?: string | null; tags?: string[] }; onSaved: () => void }) {
  const [users, setUsers] = useState<Option[]>([])
  const [companies, setCompanies] = useState<Option[]>([])
  const [contacts, setContacts] = useState<Option[]>([])
  const [owner, setOwner] = useState(initial.assigned_user_id ?? '')
  const [company, setCompany] = useState(initial.company_id ?? '')
  const [contact, setContact] = useState(initial.contact_id ?? '')
  const [tags, setTags] = useState((initial.tags ?? []).join(', '))
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([listUsers(), listCompanies({ search, pageSize: 100 }), listContacts({ search, pageSize: 100 })]).then(([u,c,t]) => {
      if (!active) return
      setUsers(u.users); setCompanies(c.companies); setContacts(t.contacts)
    }).catch(e => active && setError(e.message))
    return () => { active = false }
  }, [search])
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError(''); setSuccess('')
    try {
      await api(`/api/${kind}/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ assigned_user_id: owner || null, company_id: company || null, ...(kind === 'leads' ? { contact_id: contact || null } : {}), tags: tags.split(',').map(t => t.trim()).filter(Boolean) }) })
      onSaved(); setSuccess('Vínculos e etiquetas salvos.')
    } catch (e) { setError(e instanceof Error ? e.message : 'Falha ao salvar.') } finally { setBusy(false) }
  }
  return <form onSubmit={save} className="space-y-3 border-t border-slate-200 p-4"><h4 className="font-semibold">Responsável e relacionamentos</h4>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}{success && <p role="status" className="text-sm text-emerald-700">{success}</p>}
    <RelationSelect label="Responsável" value={owner} options={users} onChange={setOwner} />
    <label className="block text-sm">Buscar empresa ou contato<input className={input} value={search} onChange={e => setSearch(e.target.value)} /></label>
    <RelationSelect label="Empresa" value={company} options={companies} onChange={setCompany} />
    {kind === 'leads' && <RelationSelect label="Contato" value={contact} options={contacts} onChange={setContact} />}
    <label className="block text-sm">Etiquetas (separadas por vírgula)<input className={input} value={tags} onChange={e => setTags(e.target.value)} /></label>
    <button disabled={busy} className="rounded bg-slate-900 px-4 py-2 text-sm text-white disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar vínculos'}</button>
  </form>
}

export function TaskEditor({ task, contactId, leadId, onClose, onSaved }: { task?: CrmTask; contactId?: string; leadId?: string; onClose: () => void; onSaved: () => void }) {
  const localDate = (value?: string | null) => value ? new Date(new Date(value).getTime() - new Date(value).getTimezoneOffset() * 60000).toISOString().slice(0,16) : ''
  const [form, setForm] = useState({ title: task?.title ?? '', description: task?.description ?? '', contactId: task?.contact_id ?? contactId ?? '', leadId: task?.lead_id ?? leadId ?? '', conversationId: task?.conversation_id ?? '', assignedUserId: task?.assigned_user_id ?? '', dueAt: localDate(task?.due_at), reminderAt: localDate(task?.reminder_at), priority: task?.priority ?? 'medium', status: task?.status ?? 'open' })
  const [choices, setChoices] = useState<{users:Option[];contacts:Option[];leads:Option[];conversations:Option[]}>({users:[],contacts:[],leads:[],conversations:[]})
  const [search, setSearch] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    let active = true
    Promise.all([listUsers(), listContacts({search,pageSize:100}), listLeads({search,pageSize:100}), listConversations({search,pageSize:100})]).then(([u,c,l,v]) => {if(active) setChoices({users:u.users,contacts:c.contacts,leads:l.leads,conversations:v.conversations})}).catch(e => active && setError(e.message))
    return () => {active = false}
  },[search])
  async function save(e: FormEvent) {
    e.preventDefault(); setBusy(true); setError('')
    const payload = { ...form, priority: form.priority as 'low'|'medium'|'high', status: form.status as 'open'|'completed'|'canceled', contactId:form.contactId || null, leadId:form.leadId || null, conversationId:form.conversationId || null, assignedUserId:form.assignedUserId || (task ? null : undefined), dueAt:form.dueAt ? new Date(form.dueAt).toISOString() : null, reminderAt:form.reminderAt ? new Date(form.reminderAt).toISOString() : null }
    try { if(task) await updateTask(task.id,payload); else await createTask(payload); onSaved(); onClose() }
    catch(e) {setError(e instanceof Error ? e.message : 'Falha ao salvar.')} finally {setBusy(false)}
  }
  return <div className="fixed inset-0 z-[60] overflow-y-auto bg-black/40 p-4"><form onSubmit={save} className="mx-auto my-6 max-w-xl space-y-3 rounded-xl bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-label="Editar tarefa"><div className="flex justify-between"><h3 className="font-semibold">{task ? 'Editar tarefa' : 'Nova tarefa'}</h3><button type="button" onClick={onClose}>Fechar</button></div>
    {error && <p role="alert" className="text-sm text-red-700">{error}</p>}
    <label className="block text-sm">Título<input required maxLength={255} className={input} value={form.title} onChange={e=>setForm({...form,title:e.target.value})} /></label>
    <label className="block text-sm">Descrição<textarea className={input} value={form.description} onChange={e=>setForm({...form,description:e.target.value})} /></label>
    <label className="block text-sm">Buscar vínculos<input className={input} value={search} onChange={e=>setSearch(e.target.value)} /></label>
    {(['contactId','leadId','conversationId','assignedUserId'] as const).map((field,i)=><RelationSelect key={field} label={['Contato','Oportunidade','Conversa','Responsável'][i]} value={form[field]} options={[choices.contacts,choices.leads,choices.conversations,choices.users][i]} onChange={value=>setForm({...form,[field]:value})} />)}
    {!task && !form.assignedUserId && <p className="text-xs text-slate-500">Sem responsável selecionado, a tarefa será atribuída a você.</p>}
    <div className="grid gap-3 sm:grid-cols-2">{(['dueAt','reminderAt'] as const).map((field,i)=><label key={field} className="text-sm">{i ? 'Lembrar em' : 'Prazo'}<input type="datetime-local" className={input} value={form[field]} onChange={e=>setForm({...form,[field]:e.target.value})} /></label>)}</div>
    <label className="block text-sm">Prioridade<select className={input} value={form.priority} onChange={e=>setForm({...form,priority:e.target.value})}><option value="low">Baixa</option><option value="medium">Média</option><option value="high">Alta</option></select></label>
    <label className="block text-sm">Estado<select className={input} value={form.status} onChange={e=>setForm({...form,status:e.target.value})}><option value="open">Pendente</option><option value="completed">Concluída</option><option value="canceled">Cancelada</option></select></label>
    <button disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white disabled:opacity-50">{busy ? 'Salvando...' : 'Salvar tarefa'}</button>
  </form></div>
}

export function ReminderList() {
  const [tasks,setTasks] = useState<CrmTask[]>([])
  const [error,setError] = useState('')
  useEffect(()=>{let active=true; const refresh=()=>api<{tasks:CrmTask[]}>('/api/tasks/reminders').then(r=>{if(active){setTasks(r.tasks);setError('')}}).catch(e=>active&&setError(e.message));void refresh();const timer=setInterval(refresh,30000);return()=>{active=false;clearInterval(timer)}},[])
  return <div aria-live="polite">{error&&<p className="text-red-700 text-sm">{error}</p>}{tasks.map(t=><div key={t.id} className="mb-2 flex items-center justify-between rounded border border-amber-200 bg-amber-50 p-3 text-sm"><span>Lembrete: {t.title}</span><button onClick={()=>{void api(`/api/tasks/${t.id}/dismiss-reminder`,{method:'POST'}).then(()=>setTasks(old=>old.filter(x=>x.id!==t.id))).catch(e=>setError(e.message))}}>Dispensar</button></div>)}</div>
}

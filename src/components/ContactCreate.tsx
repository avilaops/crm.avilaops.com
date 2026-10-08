import { useState, type FormEvent } from 'react'
import { createContact } from '../lib/crm'
export default function ContactCreate({onCreated}:{onCreated:()=>void}) {
  const [open,setOpen]=useState(false)
  const [form,setForm]=useState({name:'',email:'',phone:''})
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{await createContact({name:form.name,email:form.email||null,phone:form.phone||null});setOpen(false);setForm({name:'',email:'',phone:''});onCreated()}catch(e){setError(e instanceof Error?e.message:'Falha ao criar contato.')}finally{setBusy(false)}}
  return <div className="mb-4"><button className="rounded bg-blue-600 px-4 py-2 text-sm text-white" onClick={()=>setOpen(true)}>Novo contato</button>{open&&<form onSubmit={save} className="mt-3 space-y-3 rounded border bg-white p-4"><h3 className="font-semibold">Novo contato</h3>{error&&<p role="alert" className="text-sm text-red-700">{error}</p>}{(['name','email','phone']as const).map((key,i)=><label key={key} className="block text-sm">{['Nome','E-mail','Telefone'][i]}<input required={key==='name'} type={key==='email'?'email':key==='phone'?'tel':'text'} className="mt-1 block w-full rounded border p-2" value={form[key]} onChange={e=>setForm({...form,[key]:e.target.value})}/></label>)}<button disabled={busy} className="mr-3 rounded bg-blue-600 px-4 py-2 text-white">{busy?'Salvando...':'Criar contato'}</button><button type="button" onClick={()=>setOpen(false)}>Cancelar</button></form>}</div>
}

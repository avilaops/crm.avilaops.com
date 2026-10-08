import { useEffect, useState, type FormEvent } from 'react'
import { api } from '../lib/crm'

type Stage = { id?: string; name:string; color:string; required_fields:string[] }
export type EditablePipeline = {id:string;name:string;stages:Stage[]}
export default function PipelineSettings({ onSelect, onChanged }: {onSelect:(id:string)=>void;onChanged:()=>void}) {
  const [pipelines,setPipelines]=useState<EditablePipeline[]>([])
  const [selected,setSelected]=useState('')
  const [editing,setEditing]=useState(false)
  const [name,setName]=useState('')
  const [stages,setStages]=useState<Stage[]>([])
  const [id,setId]=useState<string>()
  const [error,setError]=useState('')
  const [busy,setBusy]=useState(false)
  function reload(){return api<{pipelines:EditablePipeline[]}>('/api/pipelines').then(r=>setPipelines(r.pipelines ?? [])).catch(e=>setError(e.message))}
  useEffect(()=>{void reload()},[])
  function edit(p?:EditablePipeline){setId(p?.id);setName(p?.name??'');setStages(p?.stages??[{name:'Entrada',color:'#3b82f6',required_fields:[]}]);setEditing(true);setError('')}
  async function save(e:FormEvent){e.preventDefault();setBusy(true);setError('');try{const r=await api<{pipeline:EditablePipeline}>(id?`/api/pipelines/${id}`:'/api/pipelines',{method:id?'PUT':'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name,stages})});await reload();setSelected(r.pipeline.id);onSelect(r.pipeline.id);onChanged();setEditing(false)}catch(e){setError(e instanceof Error?e.message:'Falha ao salvar.')}finally{setBusy(false)}}
  function move(index:number,direction:number){const next=[...stages];[next[index],next[index+direction]]=[next[index+direction],next[index]];setStages(next)}
  return <div className="space-y-3 border-b bg-white p-4"><div className="flex flex-wrap items-center gap-3"><label className="text-sm">Funil <select className="rounded border p-2" value={selected} onChange={e=>{setSelected(e.target.value);onSelect(e.target.value)}}><option value="">Todos os funis</option>{pipelines.map(p=><option key={p.id} value={p.id}>{p.name}</option>)}</select></label><button className="rounded border px-3 py-2 text-sm" onClick={()=>edit()}>Novo funil</button>{selected&&<button className="rounded border px-3 py-2 text-sm" onClick={()=>edit(pipelines.find(p=>p.id===selected))}>Configurar etapas</button>}</div>
    {error&&<p role="alert" className="text-sm text-red-700">{error}</p>}
    {editing&&<form onSubmit={save} className="space-y-3"><label className="block text-sm">Nome do funil<input required maxLength={120} className="ml-3 rounded border p-2" value={name} onChange={e=>setName(e.target.value)}/></label><p className="text-sm text-slate-500">Defina a ordem e os campos necessários para entrar em cada etapa.</p>
      {stages.map((s,i)=><div key={s.id??`new-${i}`} className="flex flex-wrap items-center gap-2 rounded border p-3"><input aria-label={`Nome da etapa ${i+1}`} required value={s.name} className="rounded border p-2" onChange={e=>setStages(old=>old.map((v,n)=>n===i?{...v,name:e.target.value}:v))}/><input aria-label="Cor" type="color" value={s.color} onChange={e=>setStages(old=>old.map((v,n)=>n===i?{...v,color:e.target.value}:v))}/>{[['contact_id','Contato'],['company_id','Empresa'],['assigned_user_id','Responsável'],['value_cents','Valor']].map(([field,label])=><label key={field} className="text-xs"><input type="checkbox" checked={s.required_fields.includes(field)} onChange={e=>setStages(old=>old.map((v,n)=>n===i?{...v,required_fields:e.target.checked?[...v.required_fields,field]:v.required_fields.filter(f=>f!==field)}:v))}/> {label}</label>)}<button type="button" disabled={i===0} onClick={()=>move(i,-1)} aria-label="Mover etapa para cima">↑</button><button type="button" disabled={i===stages.length-1} onClick={()=>move(i,1)} aria-label="Mover etapa para baixo">↓</button><button type="button" disabled={stages.length===1} onClick={()=>setStages(old=>old.filter((_,n)=>n!==i))}>Remover</button></div>)}
      <div className="flex flex-wrap gap-3"><button type="button" onClick={()=>setStages(old=>[...old,{name:'Nova etapa',color:'#3b82f6',required_fields:[]}])}>Adicionar etapa</button><button disabled={busy} className="rounded bg-blue-600 px-4 py-2 text-white">{busy?'Salvando...':'Salvar funil'}</button><button type="button" onClick={()=>setEditing(false)}>Cancelar</button>{id&&<button type="button" className="text-red-700" disabled={busy} onClick={()=>{if(confirm('Excluir este funil vazio?')){setBusy(true);void api(`/api/pipelines/${id}`,{method:'DELETE'}).then(async()=>{await reload();setSelected('');onSelect('');onChanged();setEditing(false)}).catch(e=>setError(e.message)).finally(()=>setBusy(false))}}}>Excluir funil</button>}</div>
    </form>}
  </div>
}

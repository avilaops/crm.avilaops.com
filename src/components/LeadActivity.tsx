import { useEffect, useState } from 'react'
import { api, type CrmLead, type CrmTask } from '../lib/crm'
import { RecordRelations, TaskEditor } from './CrmRecordTools'

export default function LeadActivity({id,onUpdated}:{id:string;onUpdated:(lead:CrmLead)=>void}) {
  const [data,setData]=useState<{lead:CrmLead;events:{id:string;event_type:string;created_at:string}[];tasks:CrmTask[]}>()
  const [error,setError]=useState('')
  const [editor,setEditor]=useState<CrmTask | null | undefined>()
  function refresh(){return api<NonNullable<typeof data>>(`/api/leads/${id}/timeline`).then(r=>{setData(r);setError('');onUpdated(r.lead)}).catch(e=>setError(e.message))}
  useEffect(()=>{
    let active=true
    api<NonNullable<typeof data>>(`/api/leads/${id}/timeline`).then(r=>{if(active){setData(r);setError('')}}).catch(e=>active&&setError(e.message))
    return()=>{active=false}
  },[id])
  return <section className="space-y-3 border-t pt-4"><h3 className="font-semibold">Relacionamento e histórico</h3>{error&&<p role="alert" className="text-sm text-red-700">{error}<button onClick={()=>void refresh()} className="ml-2 underline">Tentar novamente</button></p>}{!data&&!error&&<p>Carregando histórico...</p>}{data&&<>
    <RecordRelations key={id} kind="leads" id={id} initial={data.lead} onSaved={()=>void refresh()}/>
    <div className="flex justify-between"><h4 className="text-sm font-semibold">Tarefas</h4><button onClick={()=>setEditor(null)} className="text-sm text-blue-700">Nova tarefa</button></div>
    {!data.tasks.length&&<p className="text-sm text-slate-500">Nenhuma tarefa vinculada.</p>}{data.tasks.map(t=><button key={t.id} onClick={()=>setEditor(t)} className="block w-full rounded border p-3 text-left text-sm">{t.title} · {t.status==='completed'?'Concluída':t.status==='canceled'?'Cancelada':'Pendente'}</button>)}
    <h4 className="text-sm font-semibold">Histórico</h4>{!data.events.length&&<p className="text-sm text-slate-500">Nenhuma alteração registrada.</p>}{data.events.map(e=><p key={e.id} className="border-l-2 pl-3 text-sm"><span>{({'lead.created':'Oportunidade criada','lead.updated':'Oportunidade atualizada','lead.stage_changed':'Etapa alterada'} as Record<string,string>)[e.event_type]??e.event_type}</span><time className="block text-xs text-slate-500">{new Date(e.created_at).toLocaleString('pt-BR')}</time></p>)}
  </>}{editor!==undefined&&<TaskEditor task={editor??undefined} leadId={id} onClose={()=>setEditor(undefined)} onSaved={()=>void refresh()}/>}</section>
}

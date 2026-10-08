import { useEffect, useState } from 'react'
import { api } from '../lib/crm'
export default function InboxPresence() {
  const [users,setUsers]=useState<{id:string;name:string}[]>([])
  const [available,setAvailable]=useState(true)
  useEffect(()=>{let active=true;const load=()=>api<{users:{id:string;name:string}[]}>('/api/realtime/presence').then(r=>{if(active){setUsers(r.users ?? []);setAvailable(true)}}).catch(()=>active&&setAvailable(false));void load();const timer=setInterval(load,25000);return()=>{active=false;clearInterval(timer)}},[])
  return <span className="text-xs text-slate-500" title={users.map(u=>u.name).join(', ')}>{available?`${users.length} pessoa(s) online`:'Presença indisponível'}</span>
}

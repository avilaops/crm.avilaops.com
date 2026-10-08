import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID, createHash, scryptSync, createHmac } from 'node:crypto';
import { readFile } from 'node:fs/promises';

// Never seed or migrate the normal application database.
const enabled = process.env.CRM_INTEGRATION_TEST === '1';
let app, db, realtime, tenantA, tenantB, admin, agent, other, contact, company, foreignContact, foreignCompany, foreignStage, conversation, lead;
const cookies = {};
const hash = value => createHash('sha256').update(value).digest('hex');
async function call(method,url,body,as='admin') {
  return app.inject({method,url,headers:{cookie:cookies[as]??''},...(body===undefined?{}:{payload:body})});
}
async function ok(method,url,body,as='admin',status=200) {
  const r=await call(method,url,body,as);assert.equal(r.statusCode,status,`${method} ${url}: ${r.body}`);return r.json();
}
before(async()=>{
  if(!enabled)return;
  if(!process.env.DATABASE_URL?.includes('/crm_test_'))throw new Error('Use a dedicated crm_test_ database.');
  process.env.CRM_TEST_MODE='1';process.env.NODE_ENV='test';process.env.ENCRYPTION_KEY='isolated-test-key';
  db=await import('../../dist-server/db.js');
  await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  // Idempotent migration is part of acceptance.
  await db.query(await readFile(new URL('../schema.sql',import.meta.url),'utf8'));
  tenantA=randomUUID();tenantB=randomUUID();
  await db.query('insert into tenants(id,name,slug) values($1,$2,$3),($4,$5,$6)',[tenantA,'Fixture A',`fixture-a-${tenantA}`,tenantB,'Fixture B',`fixture-b-${tenantB}`]);
  for(const [name,role,tenant] of [['admin','admin',tenantA],['agent','atendente',tenantA],['manager','gerente',tenantA],['other','admin',tenantB]]) {
    const id=randomUUID(),token=randomUUID();cookies[name]=`agenda_session=${token}`;
    const salt='testsalt';const password=`scrypt$${salt}$${scryptSync('test-password',salt,64).toString('hex')}`;
    await db.query('insert into users(id,tenant_id,name,email,role,password_hash) values($1,$2,$3,$4,$5,$6)',[id,tenant,name,`${name}@example.test`,role,password]);
    await db.query("insert into sessions(tenant_id,user_id,token_hash,expires_at) values($1,$2,$3,now()+interval '1 day')",[tenant,id,hash(token)]);
    if(name==='admin')admin=id;if(name==='agent')agent=id;if(name==='other')other=id;
  }
  const {buildApp}=await import('../../dist-server/server.js');app=await buildApp({background:false});
  company=(await ok('POST','/api/companies',{name:'Acme A',phone:'123'},'admin',201)).company;
  foreignCompany=(await ok('POST','/api/companies',{name:'Acme B'},'other',201)).company;
  contact=(await ok('POST','/api/contacts',{name:'Alice',company_id:company.id,assigned_user_id:agent,tags:['piloto']},'admin',201)).contact;
  foreignContact=(await ok('POST','/api/contacts',{name:'Bob'},'other',201)).contact;
  foreignStage=(await ok('POST','/api/pipelines',{name:'B',stages:[{name:'B1'}]},'other',201)).pipeline.stages[0];
  conversation=(await db.query('insert into conversations(tenant_id,contact_id,unread_count) values($1,$2,3) returning *',[tenantA,contact.id])).rows[0];
  lead=(await ok('POST','/api/leads',{title:'Negociacao A',contact_id:contact.id,company_id:company.id,assigned_user_id:agent,tags:['novo']},'admin',201)).lead;
});
after(async()=>{if(!enabled)return;if(app)await app.close();if(realtime)await realtime.stopRealtime();if(db)await db.closeDb()});

test('login resolves explicit tenant and never trusts tenant headers',{skip:!enabled},async()=>{
  const r=await ok('POST','/api/auth/login',{email:'other@example.test',password:'test-password',tenantSlug:`fixture-b-${tenantB}`});assert.equal(r.user.tenant_id,tenantB);
  const response=await app.inject({url:'/api/contacts',headers:{cookie:cookies.admin,'x-tenant-id':tenantB}});assert.ok(response.json().contacts.every(c=>c.name!=='Bob'));
});
test('anonymous and disabled sessions cannot use the API',{skip:!enabled},async()=>{
  assert.equal((await call('GET','/api/contacts',undefined,'none')).statusCode,401);
  await db.query('update users set active=false where id=$1',[agent]);assert.equal((await call('GET','/api/contacts',undefined,'agent')).statusCode,401);await db.query('update users set active=true where id=$1',[agent]);
});
test('tenant lists, inbox, timeline and events are isolated',{skip:!enabled},async()=>{
  for(const url of ['/api/contacts','/api/companies','/api/leads','/api/tasks?status=all','/api/conversations','/api/audit-logs','/api/bootstrap']){
    const data=await ok('GET',url);assert.ok(!JSON.stringify(data).includes(foreignContact.id),url);assert.ok(!JSON.stringify(data).includes(foreignCompany.id),url);
  }
  for(const url of [`/api/contacts/${foreignContact.id}/timeline`,`/api/companies/${foreignCompany.id}`,`/api/leads/${lead.id}/timeline`])assert.equal((await call('GET',url,undefined,url.includes(lead.id)?'other':'admin')).statusCode,404);
  assert.equal((await call('POST',`/api/conversations/${conversation.id}/read`,{},'other')).statusCode,404);
  assert.deepEqual((await ok('GET',`/api/conversations/${conversation.id}/messages`,undefined,'other')).messages,[]);
});
test('cross-tenant writes and relational injection are rejected',{skip:!enabled},async()=>{
  const cases=[['POST','/api/contacts',{name:'Bad',company_id:foreignCompany.id}],['PATCH',`/api/contacts/${contact.id}`,{assigned_user_id:other}],['POST','/api/leads',{title:'Bad',contact_id:foreignContact.id}],['PATCH',`/api/leads/${lead.id}`,{stage_id:foreignStage.id}],['POST','/api/tasks',{title:'Bad',assignedUserId:other}],['POST','/api/tasks',{title:'Bad',contactId:foreignContact.id}],['POST',`/api/conversations/${conversation.id}/assign`,{userId:other}]];
  for(const [method,url,body]of cases)assert.equal((await call(method,url,body)).statusCode,400,`${method} ${url}`);
  for(const resource of [['contacts',foreignContact.id],['companies',foreignCompany.id]])for(const method of ['PATCH','DELETE'])assert.equal((await call(method,`/api/${resource[0]}/${resource[1]}`,method==='PATCH'?{name:'Bad'}:undefined)).statusCode,404);
  await assert.rejects(db.query('update contacts set company_id=$1 where id=$2',[foreignCompany.id,contact.id]),{code:'23503'});
  await assert.rejects(db.query('update sessions set tenant_id=$1 where user_id=$2',[tenantB,admin]),{code:'23503'});
});
test('attendants and managers cannot create administrators',{skip:!enabled},async()=>{
  for(const as of ['agent','manager'])assert.equal((await call('POST','/api/users',{name:'Intruder',email:'intruder@example.test',role:'admin'},as)).statusCode,403);
  assert.equal((await call('POST','/api/pipelines',{name:'No',stages:[{name:'No'}]},'agent')).statusCode,403);
});
test('contacts and companies retain null clearing, tags, owner and timeline',{skip:!enabled},async()=>{
  const c=(await ok('PATCH',`/api/contacts/${contact.id}`,{phone:null,tags:['cliente'],assigned_user_id:admin})).contact;assert.equal(c.assigned_user_id,admin);assert.deepEqual(c.tags,['cliente']);assert.equal(c.phone,null);
  assert.equal((await ok('PATCH',`/api/companies/${company.id}`,{phone:null})).company.phone,null);
  const details=await ok('GET',`/api/companies/${company.id}`);assert.equal(details.contacts[0].id,contact.id);assert.equal(details.leads[0].id,lead.id);
  const timeline=await ok('GET',`/api/contacts/${contact.id}/timeline`);assert.ok(timeline.events.some(e=>e.event_type==='contact.updated'));
});
test('lead won/lost/reopen is auditable and clears stale timestamps',{skip:!enabled},async()=>{
  assert.ok((await ok('PATCH',`/api/leads/${lead.id}`,{status:'won'})).lead.won_at);
  const lost=(await ok('PATCH',`/api/leads/${lead.id}`,{status:'lost',lost_reason:'Prazo'})).lead;assert.equal(lost.won_at,null);assert.ok(lost.lost_at);
  const open=(await ok('PATCH',`/api/leads/${lead.id}`,{status:'open'})).lead;assert.equal(open.won_at,null);assert.equal(open.lost_at,null);assert.equal(open.lost_reason,null);
  assert.ok((await ok('GET',`/api/leads/${lead.id}/timeline`)).events.length>=4);
});
test('pipeline creation, reorder, validation and removal are transactional',{skip:!enabled},async()=>{
  const p=(await ok('POST','/api/pipelines',{name:'Vendas',stages:[{name:'Entrada'},{name:'Proposta',required_fields:['value_cents']}]},'admin',201)).pipeline;
  const r=await call('PATCH',`/api/leads/${lead.id}/stage`,{stageId:p.stages[1].id});assert.equal(r.statusCode,400);
  await ok('PATCH',`/api/leads/${lead.id}`,{value_cents:100});await ok('PATCH',`/api/leads/${lead.id}/stage`,{stageId:p.stages[1].id});
  const changed=(await ok('PUT',`/api/pipelines/${p.id}`,{name:'Vendas editado',stages:[p.stages[1],p.stages[0]]})).pipeline;assert.equal(changed.stages[0].id,p.stages[1].id);
  assert.equal((await call('PUT',`/api/pipelines/${p.id}`,{name:'Must rollback',stages:[p.stages[0]]})).statusCode,409);
  assert.equal((await call('DELETE',`/api/pipelines/${p.id}`)).statusCode,409);
  assert.equal((await call('PUT',`/api/pipelines/${p.id}`,{name:'Bad',stages:[foreignStage]})).statusCode,400);
  assert.equal((await ok('GET','/api/pipelines')).pipelines.find(x=>x.id===p.id).name,'Vendas editado');
});
test('tasks include contact, lead, conversation, responsible, reminders and states',{skip:!enabled},async()=>{
  const task=(await ok('POST','/api/tasks',{title:'Ligar',contactId:contact.id,leadId:lead.id,conversationId:conversation.id,assignedUserId:admin,dueAt:'2026-10-01T12:00:00Z',reminderAt:'2020-01-01T12:00:00Z'},'admin',201)).task;
  assert.equal(task.conversation_id,conversation.id);assert.ok((await ok('GET','/api/tasks/reminders')).tasks.some(t=>t.id===task.id));
  assert.ok(!(await ok('GET','/api/tasks/reminders',undefined,'agent')).tasks.some(t=>t.id===task.id));
  await ok('POST',`/api/tasks/${task.id}/dismiss-reminder`,{});assert.ok(!(await ok('GET','/api/tasks/reminders')).tasks.some(t=>t.id===task.id));
  const saved=(await ok('PATCH',`/api/tasks/${task.id}`,{status:'completed',contactId:null,dueAt:null,assignedUserId:agent})).task;assert.equal(saved.due_at,null);assert.equal(saved.contact_id,null);
  assert.equal((await call('PATCH',`/api/tasks/${task.id}`,{title:'Bad'},'other')).statusCode,404);
  assert.equal((await call('POST','/api/tasks',{title:'Invalid date',dueAt:'banana'})).statusCode,400);
  await ok('DELETE',`/api/tasks/${task.id}`);
});
test('OAuth state cannot write another tenant and Meta status uses session',{skip:!enabled},async()=>{
  await db.query("insert into integrations(tenant_id,provider,app_id,app_secret) values($1,'meta','123456','testsecret')",[tenantB]);
  assert.equal((await ok('GET','/api/meta/status')).configured,false);assert.equal((await ok('GET','/api/meta/status',undefined,'other')).configured,true);
  assert.equal((await call('GET',`/api/integrations/google/callback?code=fake&state=${tenantB}`)).statusCode,400);
  assert.equal((await call('POST','/api/meta/exchange',{code:'fake-code',state:'a'.repeat(32),redirectUri:'https://crm.avilaops.com/oauth-callback.html'})).statusCode,400);
});
test('Meta webhook resolves the registered channel before writing',{skip:!enabled},async()=>{
  await db.query("insert into channels(tenant_id,provider,external_id,display_name,status) values($1,'whatsapp',$2,'B','connected')",[tenantB,`phone-${tenantB}`]);
  const payload={object:'whatsapp_business_account',entry:[{id:'waba-b',changes:[{field:'messages',value:{metadata:{phone_number_id:`phone-${tenantB}`},contacts:[{wa_id:'5511999991111',profile:{name:'Webhook B'}}],messages:[{id:'webhook-fixture',from:'5511999991111',type:'text',text:{body:'Hello'}}]}}]}]};
  const raw=JSON.stringify(payload);const signature='sha256='+createHmac('sha256','testsecret').update(raw).digest('hex');
  const r=await app.inject({method:'POST',url:'/api/meta/webhook',headers:{'content-type':'application/json','x-hub-signature-256':signature},payload:raw});assert.equal(r.statusCode,200,r.body);
  const result=await db.query("select tenant_id from messages where external_id='webhook-fixture' and tenant_id=$1",[tenantB]);assert.equal(result.rows[0].tenant_id,tenantB);
  assert.equal((await call('POST','/api/meta/webhook',payload)).statusCode,401);
});
test('calendar updates, cancellation, reopening and failures are auditable without external calls',{skip:!enabled},async()=>{
  const task=(await db.query("insert into tasks(tenant_id,title,due_at) values($1,'Calendar fixture','2026-10-01T12:00:00Z') returning *",[tenantA])).rows[0];
  await db.query("insert into integrations(tenant_id,provider,access_token) values($1,'google_calendar','fixture-token')",[tenantA]);
  const {syncTaskToGoogleCalendar}=await import('../../dist-server/server.js');
  const original=globalThis.fetch,calls=[];let statuses=[];
  globalThis.fetch=async(url,options)=>{calls.push({url,method:options.method,body:options.body?JSON.parse(options.body):null});const status=statuses.shift()??200;return new Response('{}',{status})};
  try {
    statuses=[404,200];await syncTaskToGoogleCalendar(tenantA,task);assert.deepEqual(calls.map(c=>c.method),['PUT','POST']);const id=calls[1].body.id;
    calls.length=0;await syncTaskToGoogleCalendar(tenantA,task);assert.equal(calls.length,1);assert.ok(calls[0].url.endsWith(id));assert.equal(calls[0].body.status,'confirmed');
    await db.query("update tasks set status='completed' where id=$1",[task.id]);calls.length=0;await syncTaskToGoogleCalendar(tenantA,task);assert.equal(calls[0].method,'DELETE');
    await db.query("update tasks set status='open' where id=$1",[task.id]);calls.length=0;statuses=[410,200];await syncTaskToGoogleCalendar(tenantA,task);assert.equal(calls[1].method,'POST');assert.notEqual(calls[1].body.id,id);
    statuses=[503];await syncTaskToGoogleCalendar(tenantA,task);assert.equal((await db.query("select count(*)::int as n from events where tenant_id=$1 and event_type='google_calendar.sync_failed' and payload->>'task_id'=$2",[tenantA,task.id])).rows[0].n,1);
  } finally {globalThis.fetch=original;await db.query("delete from integrations where tenant_id=$1 and provider='google_calendar'",[tenantA])}
});
test('presence and SSE events stay inside the tenant',{skip:!enabled},async()=>{
  const presence=await ok('GET','/api/realtime/presence');assert.ok(presence.users.some(u=>u.id===admin));assert.ok(!presence.users.some(u=>u.id===other));
  await app.listen({port:0,host:'127.0.0.1'});const address=app.server.address();const controller=new AbortController();
  const response=await fetch(`http://127.0.0.1:${address.port}/api/realtime`,{headers:{cookie:cookies.admin},signal:controller.signal});assert.equal(response.status,200);assert.equal(response.headers.get('x-accel-buffering'),'no');
  const reader=response.body.getReader();let data=new TextDecoder().decode((await reader.read()).value);assert.ok(data.includes('ready'));
  realtime=await import('../../dist-server/realtime.js');
  await realtime.publishRealtime({type:'conversation.updated',tenantId:tenantB,data:{marker:'FOREIGN'}});
  await realtime.publishRealtime({type:'conversation.updated',tenantId:tenantA,conversationId:conversation.id,data:{marker:'OWN'}});
  data+=new TextDecoder().decode((await reader.read()).value);assert.ok(data.includes('OWN'));assert.ok(!data.includes('FOREIGN'));
  controller.abort();await reader.cancel().catch(()=>{});
});

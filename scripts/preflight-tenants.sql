select 'tenants',count(*) from tenants;
select 'users-role-'||role,count(*) from users group by role;
select 'contacts-company-cross',count(*) from contacts c join companies x on x.id=c.company_id where c.tenant_id<>x.tenant_id;
select 'leads-contact-cross',count(*) from leads l join contacts c on c.id=l.contact_id where l.tenant_id<>c.tenant_id;
select 'leads-company-cross',count(*) from leads l join companies c on c.id=l.company_id where l.tenant_id<>c.tenant_id;
select 'leads-stage-cross',count(*) from leads l join pipeline_stages s on s.id=l.stage_id join pipelines p on p.id=s.pipeline_id where l.tenant_id<>p.tenant_id;
select 'tasks-owner-cross',count(*) from tasks t join users u on u.id=t.assigned_user_id where t.tenant_id<>u.tenant_id;
select 'conversations-contact-cross',count(*) from conversations v join contacts c on c.id=v.contact_id where v.tenant_id<>c.tenant_id;
select 'sessions-user-cross',count(*) from sessions s join users u on u.id=s.user_id where s.tenant_id<>u.tenant_id;

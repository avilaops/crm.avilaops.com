// UI verification server: only runs against the isolated acceptance database.
import { scryptSync } from 'node:crypto';
if (!process.env.DATABASE_URL?.endsWith('/crm_test_acceptance')) throw new Error('Isolated database required');
process.env.CRM_TEST_MODE='1';
const {query}=await import('../../dist-server/db.js');
const tenant=(await query("insert into tenants(name,slug) values('CRM de teste','crm-browser-test') on conflict(slug) do update set name=excluded.name returning id")).rows[0];
await query("insert into users(tenant_id,name,email,role,password_hash) values($1,'Administrador de teste','qa@example.test','admin',$2) on conflict(tenant_id,email) do update set password_hash=excluded.password_hash",[tenant.id,`scrypt$qa-salt$${scryptSync('qa-password-2026','qa-salt',64).toString('hex')}`]);
const {buildApp}=await import('../../dist-server/server.js');
const app=await buildApp({background:false});
await app.listen({host:'0.0.0.0',port:3000});

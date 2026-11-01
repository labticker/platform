import postgres from 'postgres';import {randomBytes} from 'node:crypto';import assert from 'node:assert/strict';
import {runtimeRoles,applyRuntimeRoleGrants} from './database-role-policy.js';
async function main(){
 if(process.env.NEON_DEV_ACCEPTANCE_ENABLED!=='true'||process.env.NODE_ENV==='production'||!process.env.DATABASE_URL||!process.env.EXPECTED_DEV_DATABASE_HOST)throw new Error('Explicit isolated development role test required');
 const url=new URL(process.env.DATABASE_URL);if(url.hostname!==process.env.EXPECTED_DEV_DATABASE_HOST||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Expected development endpoint with verified TLS');
 const owner=postgres(url.href,{max:1,prepare:false,onnotice:()=>{}}),clients:ReturnType<typeof postgres>[]=[],created:string[]=[];
 try{
  const existing=await owner`select rolname from pg_roles where rolname in ('labticker_web','labticker_worker','labticker_reports')`;assert.equal(existing.length,0,'Development test refuses existing runtime roles');
  const passwords=new Map(runtimeRoles.map(role=>[role,randomBytes(48).toString('base64url')]));
  for(const role of runtimeRoles){await owner.unsafe(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${passwords.get(role)}'`);created.push(role);}
  await owner.begin(async tx=>applyRuntimeRoleGrants(tx));
  const connections=runtimeRoles.map(role=>{const scoped=new URL(url);scoped.username=role;scoped.password=passwords.get(role)!;const client=postgres(scoped.href,{max:1,prepare:false,connect_timeout:10});clients.push(client);return client;});
  const [web,worker,reports]=connections;
  await web!`select id from applications limit 1`;await worker!`select id from job_runs limit 1`;await reports!`select metric_name from analytics_daily_aggregates limit 1`;
  await assert.rejects(reports!`select email from users`,{code:'42501'});await assert.rejects(worker!`select session_token from auth_sessions`,{code:'42501'});
  await assert.rejects(reports!`update analytics_daily_aggregates set metric_value=999`);
 }finally{
  await Promise.all(clients.map(client=>client.end({timeout:5}).catch(()=>{})));
  try{for(const role of created.reverse()){
    await owner.unsafe(`REVOKE ALL ON ALL TABLES IN SCHEMA public FROM ${role}`);await owner.unsafe(`REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM ${role}`);await owner.unsafe(`REVOKE ALL ON SCHEMA public FROM ${role}`);await owner.unsafe(`DROP ROLE ${role}`);
   }}finally{await owner.end({timeout:5});}
 }
 console.log(JSON.stringify({accepted:true,environment:'isolated-neon-development',roles:3,aggregateOnly:true,testRolesRemoved:true,productionChanges:false}));
}
main().catch(error=>{const code=error&&typeof error.code==='string'&&/^[A-Z0-9]{5}$/.test(error.code)?error.code:'unknown';console.error(`Isolated Neon role acceptance failed (${code}); no credentials or query parameters logged.`);process.exitCode=1;});

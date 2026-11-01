import postgres from 'postgres';
import {randomBytes} from 'node:crypto';
import {applyRuntimeRoleGrants,runtimeRoles} from './database-role-policy.js';
import {stageFlySecrets} from './fly-secret-stdin.js';
async function main(){
 if(process.env.RUNTIME_ROLES_APPROVED!=='true'||!process.env.MIGRATION_DATABASE_URL)throw new Error('Role approval and migration owner required');
 const url=new URL(process.env.MIGRATION_DATABASE_URL);
 if(!['postgres:','postgresql:'].includes(url.protocol)||!['require','verify-full'].includes(url.searchParams.get('sslmode')??''))throw new Error('PostgreSQL TLS required');
 const sql=postgres(process.env.MIGRATION_DATABASE_URL,{max:1,prepare:false});
 try{
  const existing=await sql<{rolname:string}[]>`SELECT rolname FROM pg_roles WHERE rolname IN ('labticker_web','labticker_worker','labticker_reports')`;
  const bootstrap=process.env.RUNTIME_ROLES_BOOTSTRAP==='true';
  if(bootstrap&&existing.length)throw new Error('Bootstrap refuses existing roles; use reviewed rotation procedure');
  if(!bootstrap&&existing.length!==3)throw new Error('Runtime roles are not bootstrapped');
  await sql.begin(async tx=>{
   const secrets:Record<string,string>={};
   if(bootstrap){
    for(const role of runtimeRoles){
     const password=randomBytes(48).toString('base64url');
     // Both identifiers and password are generated/allowlisted, never caller SQL.
     await tx.unsafe(`CREATE ROLE ${role} LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOBYPASSRLS PASSWORD '${password}'`);
     const connection=new URL(url);connection.username=role;connection.password=password;
     secrets[role==='labticker_web'?'WEB_DATABASE_URL':role==='labticker_worker'?'WORKER_DATABASE_URL':'REPORT_DATABASE_URL']=connection.href;
    }
   }
   await applyRuntimeRoleGrants(tx);
   if(bootstrap)await stageFlySecrets(process.env.FLY_APP??'',secrets);
  });
  console.log(JSON.stringify({operation:'runtime-role-policy',status:'applied',bootstrap}));
 }finally{await sql.end({timeout:5});}
}
main().catch(()=>{console.error('Runtime role provisioning failed; no credentials are logged. Review restricted diagnostics before retrying.');process.exitCode=1;});

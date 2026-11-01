import {readFile} from 'node:fs/promises';
import postgres from 'postgres';
if(process.env.NEON_DEV_ACCEPTANCE_ENABLED!=='true'||process.env.NODE_ENV==='production'||!process.env.DATABASE_URL||!process.env.EXPECTED_DEV_DATABASE_HOST)throw new Error('Explicit development schema check required');
const url=new URL(process.env.DATABASE_URL);
if(url.hostname!==process.env.EXPECTED_DEV_DATABASE_HOST||!url.hostname.endsWith('.neon.tech')||url.searchParams.get('sslmode')!=='verify-full')throw new Error('Expected isolated Neon development endpoint');
const client=postgres(process.env.DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
try{
 const migration=await client`select count(*)::int as count from drizzle.__drizzle_migrations`;
 const tables=await client`select table_name from information_schema.tables where table_schema='public'`;
 const indexes=await client`select indexname from pg_indexes where schemaname='public' and indexname='job_runs_recent'`;
 const expected=JSON.parse(await readFile('drizzle/meta/_journal.json','utf8')).entries.length;
 if(migration[0]?.count!==expected||tables.length<20||indexes.length!==1)throw new Error('Schema acceptance failed');
 console.log('Development schema acceptance passed: reviewed migrations, application tables and worker index');
}catch{console.error('Development schema acceptance failed; inspect restricted infrastructure diagnostics');process.exitCode=1;}
finally{await client.end({timeout:5});}

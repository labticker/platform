import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {readFile} from 'node:fs/promises';
if(process.env.MIGRATION_APPROVED!=='true'||!process.env.DATABASE_URL)throw new Error('Approved migration credentials required');
let url:URL;
try{url=new URL(process.env.DATABASE_URL);}catch{throw new Error('Migration database URL is invalid');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['require','verify-full'].includes(url.searchParams.get('sslmode')??''))throw new Error('Migration requires PostgreSQL TLS');
if(process.env.MIGRATION_TARGET==='production'){
 let backup:{ready?:boolean;migrationTargetVerified?:boolean;parentBranchId?:string;projectId?:string;verifiedAt?:string;migrationHost?:string};
 try{backup=JSON.parse(await readFile(process.env.BACKUP_ATTESTATION_PATH??'','utf8'));}catch{throw new Error('Fresh verified production backup required');}
 const age=Date.now()-Date.parse(backup.verifiedAt??'');
 if(!backup.ready||!backup.migrationTargetVerified||backup.parentBranchId!==process.env.NEON_MAIN_BRANCH_ID||backup.projectId!==process.env.NEON_PROJECT_ID||backup.migrationHost!==url.hostname.replace('-pooler.','.')||!Number.isFinite(age)||age<0||age>1800000)throw new Error('Production backup attestation does not match target');
}
const client=postgres(process.env.DATABASE_URL,{max:1,prepare:false,onnotice:()=>{}});
try{await migrate(drizzle(client),{migrationsFolder:'drizzle'});console.log('Reviewed migrations applied');}
catch{console.error('Migration failed; consult restricted database diagnostics');process.exitCode=1;}
finally{await client.end({timeout:5});}

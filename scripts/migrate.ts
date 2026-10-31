import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
if(process.env.MIGRATION_APPROVED!=='true'||!process.env.DATABASE_URL)throw new Error('Approved migration credentials required');
let url:URL;
try{url=new URL(process.env.DATABASE_URL);}catch{throw new Error('Migration database URL is invalid');}
if(!['postgres:','postgresql:'].includes(url.protocol)||!['require','verify-full'].includes(url.searchParams.get('sslmode')??''))throw new Error('Migration requires PostgreSQL TLS');
const client=postgres(process.env.DATABASE_URL,{max:1,prepare:false});
try{await migrate(drizzle(client),{migrationsFolder:'drizzle'});console.log('Reviewed migrations applied');}
catch{console.error('Migration failed; consult restricted database diagnostics');process.exitCode=1;}
finally{await client.end({timeout:5});}

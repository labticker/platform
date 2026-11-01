import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
let database: ReturnType<typeof connect> | undefined;
let reportingDatabase: ReturnType<typeof connectReporting> | undefined;
const localRuntime=globalThis as typeof globalThis&{labtickerDevelopmentDatabase?:ReturnType<typeof connect>};
function connect(url:string){
 const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
 return drizzle(postgres(url,{max:local?1:5,prepare:false,connect_timeout:10,idle_timeout:20}),{schema});
}
function connectReporting(url:string){return drizzle(postgres(url,{max:1,prepare:false,connect_timeout:10,idle_timeout:20}),{schema:{analyticsDailyAggregates:schema.analyticsDailyAggregates}});}
function validateConnection(connection:string){
 let url:URL;try{url=new URL(connection);}catch{throw new Error('Database URL is invalid');}
 if(!['postgres:','postgresql:'].includes(url.protocol))throw new Error('Unsupported database protocol');
 if(process.env.NODE_ENV==='production'&&!['require','verify-full'].includes(url.searchParams.get('sslmode')??''))throw new Error('Production database requires TLS');
}
/** Lazy runtime connection; never reads/logs credentials at module import or build time. */
export function getDatabase(){
 if(database) return database;
 if(process.env.NODE_ENV!=='production'&&localRuntime.labtickerDevelopmentDatabase){database=localRuntime.labtickerDevelopmentDatabase;return database;}
 const group=process.env.FLY_PROCESS_GROUP;
 const connection=group==='web'?process.env.WEB_DATABASE_URL:group==='worker'?process.env.WORKER_DATABASE_URL:process.env.DATABASE_URL;
 if(!connection) throw new Error('Database is not configured');
 validateConnection(connection);
 database=connect(connection);if(process.env.NODE_ENV!=='production')localRuntime.labtickerDevelopmentDatabase=database;return database;
}
/** Production reporting never falls back to a subscriber-capable application/owner connection. */
export function getReportingDatabase(){
 if(reportingDatabase)return reportingDatabase;
 const connection=process.env.REPORT_DATABASE_URL??(process.env.NODE_ENV!=='production'?process.env.DATABASE_URL:undefined);
 if(!connection)throw new Error('Read-only aggregate database is not configured');
 validateConnection(connection);reportingDatabase=connectReporting(connection);return reportingDatabase;
}
export async function closeDatabase(){const previous=database,report=reportingDatabase;database=undefined;reportingDatabase=undefined;delete localRuntime.labtickerDevelopmentDatabase;await Promise.all([previous?.$client.end({timeout:5}),report?.$client.end({timeout:5})]);}

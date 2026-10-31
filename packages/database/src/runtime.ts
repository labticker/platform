import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from './schema.js';
let database: ReturnType<typeof connect> | undefined;
const localRuntime=globalThis as typeof globalThis&{labtickerDevelopmentDatabase?:ReturnType<typeof connect>};
function connect(url:string){
 const local=process.env.NODE_ENV!=='production'&&['localhost','127.0.0.1','[::1]'].includes(new URL(url).hostname);
 return drizzle(postgres(url,{max:local?1:5,prepare:false,connect_timeout:10,idle_timeout:20}),{schema});
}
/** Lazy runtime connection; never reads/logs credentials at module import or build time. */
export function getDatabase(){
 if(database) return database;
 if(process.env.NODE_ENV!=='production'&&localRuntime.labtickerDevelopmentDatabase){database=localRuntime.labtickerDevelopmentDatabase;return database;}
 const connection=process.env.DATABASE_URL;
 if(!connection) throw new Error('Database is not configured');
 let url:URL;try{url=new URL(connection);}catch{throw new Error('Database URL is invalid');}
 if(!['postgres:','postgresql:'].includes(url.protocol)) throw new Error('Unsupported database protocol');
 if(process.env.NODE_ENV==='production' && !['require','verify-full'].includes(url.searchParams.get('sslmode')??'')) throw new Error('Production database requires TLS');
 database=connect(connection);if(process.env.NODE_ENV!=='production')localRuntime.labtickerDevelopmentDatabase=database;return database;
}
export async function closeDatabase(){const previous=database;database=undefined;delete localRuntime.labtickerDevelopmentDatabase;if(previous)await previous.$client.end({timeout:5});}

import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {PGlite} from '@electric-sql/pglite';
import {PGLiteSocketServer} from '@electric-sql/pglite-socket';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import postgres from 'postgres';
import * as schema from '../packages/database/src/schema.js';

// Deliberately development-only and in-memory. Socket transport has no authentication;
// never bind beyond loopback, load real data, or use it as production/Postgres proof.
if(process.env.NODE_ENV==='production'||process.env.LOCAL_DB_FIXTURE_ENABLED!=='true') throw new Error('Local fixture database requires explicit development opt-in');
const port=Number(process.env.LOCAL_DB_FIXTURE_PORT??55432);
if(!Number.isSafeInteger(port)||port<1024||port>65535)throw new Error('Invalid local fixture port');
const root=fileURLToPath(new URL('../',import.meta.url));
const client=await PGlite.create();
const db=drizzle(client,{schema});
await migrate(db,{migrationsFolder:resolve(root,'drizzle')});
for(const slug of ['home-assistant','immich','jellyfin']){
 const definition=JSON.parse(await readFile(resolve(root,'catalog/services',`${slug}.json`),'utf8')) as {name:string;summary:string;category:string;website:string;repository?:{url:string};releaseSources:{kind:string;repository?:string}[]};
 const [app]=await db.insert(schema.applications).values({slug,name:definition.name,description:definition.summary,category:definition.category,homepageUrl:definition.website,repoUrl:definition.repository?.url}).returning();
 if(!app)throw new Error('Fixture seed failed');
 for(const source of definition.releaseSources){
  if(source.kind==='github-releases'&&source.repository){
   const [feed]=await db.insert(schema.releaseSources).values({applicationId:app.id,provider:source.kind,externalKey:source.repository,url:`https://api.github.com/repos/${source.repository}/releases`,lastOkAt:new Date(),lastPolledAt:new Date()}).returning();
   if(feed)await db.insert(schema.releases).values({applicationId:app.id,releaseSourceId:feed.id,dedupeKey:`local-fixture-${slug}`,tag:'fixture-v1',title:'Synthetic local acceptance release',releaseUrl:`https://github.com/${source.repository}/releases/tag/fixture-v1`,notesText:'Synthetic fixture notes. Migration required. This is not an upstream release.',publishedAt:new Date(Date.now()-86400000),firstSeenAt:new Date(Date.now()-86400000),isBackfill:true,warningFlags:[{label:'Migration mentioned',evidence:'Synthetic fixture: migration required',advisory:true}]});
  }
 }
}
const server=new PGLiteSocketServer({db:client,host:'127.0.0.1',port,inspect:false,maxConnections:10});
await server.start();
const sql=postgres({host:'127.0.0.1',port,database:'postgres',username:'postgres',max:1,prepare:false,connect_timeout:5});
try{
 const [result]=await sql<{count:number}[]>`select count(*)::int as count from applications`;
 if(result?.count!==3)throw new Error('TCP fixture verification failed');
}finally{await sql.end({timeout:5});}
console.log(JSON.stringify({service:'labticker-local-fixture-db',host:'127.0.0.1',port,seedApplications:3,persistent:false,authenticated:false}));
let stopping=false;
async function stop(){if(stopping)return;stopping=true;await server.stop();await client.close();process.exit(0);}
process.once('SIGINT',()=>{void stop();});
process.once('SIGTERM',()=>{void stop();});

import postgres from 'postgres';import {drizzle} from 'drizzle-orm/postgres-js';
import * as schema from '../packages/database/src/schema.js';
import {loadRegistry} from '../packages/catalog/src/index.js';
import {syncRegistry} from '../apps/worker/src/catalog.js';import {pollOneSource} from '../apps/worker/src/releases.js';
import {GitHubReleasesAdapter,SafeHttpClient} from '../packages/releases/src/index.js';
async function main(){
 if(process.env.CATALOG_BOOTSTRAP_APPROVED!=='true'||!process.env.DATABASE_URL||!/^[a-f0-9]{40}$/.test(process.env.CATALOG_GIT_SHA??''))throw new Error('Reviewed catalog bootstrap required');
 const url=new URL(process.env.DATABASE_URL);if(url.searchParams.get('sslmode')!=='verify-full')throw new Error('Verified PostgreSQL TLS required');
 const client=postgres(url.href,{max:1,prepare:false,onnotice:()=>{}}),db=drizzle(client,{schema});
 try{
  const count=await syncRegistry(db,await loadRegistry(),process.env.CATALOG_GIT_SHA!);
  // The job token remains in CI memory. Never stage it as a Fly/runtime credential.
  const adapter=new GitHubReleasesAdapter(new SafeHttpClient({allowedHosts:['api.github.com'],githubToken:process.env.GITHUB_RELEASE_BOOTSTRAP_TOKEN,maxBytes:8388608}),undefined,5,'recent-window',20);
  let polled=0,failed=0;for(let index=0;index<count;index++){const result=await pollOneSource(db,adapter);if(result.status==='idle')break;polled++;if(result.status==='failed')failed++;}
  const [coverage]=await client<{ready:number;unpolled:number}[]>`select count(*) filter (where last_ok_at is not null)::int as ready,count(*) filter (where last_ok_at is null)::int as unpolled from release_sources where enabled=true`;
  console.log(JSON.stringify({catalog:count,polled,failed,ready:coverage?.ready,unpolled:coverage?.unpolled,initialHistory:'baseline-not-emailed'}));
  if(count<50||!coverage?.ready)throw new Error('Catalog bootstrap has insufficient source coverage');
 }finally{await client.end({timeout:5});}
}
main().catch(()=>{console.error('Reviewed catalog bootstrap failed; previous release history remains intact');process.exitCode=1;});

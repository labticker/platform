import {getDatabase,closeDatabase} from '@labticker/database/runtime';
import {setTimeout as delay} from 'node:timers/promises';
import {loadRegistry} from '@labticker/catalog';
import {syncRegistry} from './catalog.js';
import {pollOneSource} from './releases.js';
import {materializeDaily} from '@labticker/reporting';
async function main(){
 if(process.env.WORKER_ENABLED!=='true'){
  console.log(JSON.stringify({service:'labticker-worker',status:'disabled',publicEmailEnabled:false}));return;
 }
 if(process.env.WORKER_MODE!=='catalog-poll') throw new Error('Set WORKER_MODE=catalog-poll; digest scheduling is not enabled');
 if(process.env.PUBLIC_EMAIL_ENABLED==='true'||(process.env.EMAIL_DELIVERY_MODE??'mock')!=='mock') throw new Error('This worker supports mock email only');
 const revision=process.env.CATALOG_GIT_SHA??'';
 if(!/^[a-f0-9]{7,64}$/.test(revision)) throw new Error('CATALOG_GIT_SHA is required');
 const db=getDatabase();let running=true;let lastCatalogSync=0;let lastReportRefresh=0;const shutdown=new AbortController();
 const stop=()=>{running=false;shutdown.abort();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 while(running){
  const now=new Date();
  try{
   if(now.getTime()-lastCatalogSync>=86400000){
    const count=await syncRegistry(db,await loadRegistry(),revision,now);lastCatalogSync=now.getTime();
    console.log(JSON.stringify({service:'labticker-worker',job:'catalog-sync',status:'ok',count}));
   }
   for(let index=0;running&&index<50;index++){
    const result=await pollOneSource(db,undefined,new Date());
    if(result.status==='idle')break;
    console.log(JSON.stringify({service:'labticker-worker',job:'release-poll',...result}));
   }
   if(running&&now.getTime()-lastReportRefresh>=86400000){
    // 30-day cohort maturation plus 14 days for delayed engagement events.
    for(let days=45;running&&days>=1;days--) await materializeDaily(db,new Date(now.getTime()-days*86400000).toISOString().slice(0,10),now);
    if(running){lastReportRefresh=now.getTime();console.log(JSON.stringify({service:'labticker-worker',job:'aggregate-refresh',status:'ok'}));}
   }
  }catch{console.error(JSON.stringify({service:'labticker-worker',status:'degraded',error:'Worker tick failed'}));}
  if(running) await delay(60000,undefined,{signal:shutdown.signal}).catch(()=>{});
 }
}
main().catch(()=>{console.error(JSON.stringify({service:'labticker-worker',status:'startup-failed'}));process.exitCode=1;}).finally(closeDatabase);

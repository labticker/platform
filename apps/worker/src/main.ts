import {getDatabase,closeDatabase} from '@labticker/database/runtime';
import {setTimeout as delay} from 'node:timers/promises';
import {loadRegistry} from '@labticker/catalog';
import {syncRegistry} from './catalog.js';
import {pollOneSource} from './releases.js';
import {materializeDaily,materializeSourceSnapshot} from '@labticker/reporting';
import {runWorkerJob} from '@labticker/database/operations';
import {MockEmailGateway,appOrigin} from '@labticker/notifications';
import {prepareDueDigest,sendOneDigest,type DigestQueueConfig} from './digests.js';
async function main(){
 if(process.env.WORKER_ENABLED!=='true'){
  console.log(JSON.stringify({service:'labticker-worker',status:'disabled',publicEmailEnabled:false}));return;
 }
 const mode=process.env.WORKER_MODE;
 if(mode!=='catalog-poll'&&mode!=='mock-pilot') throw new Error('Worker requires explicit catalog-poll or mock-pilot mode');
 if(process.env.PUBLIC_EMAIL_ENABLED==='true'||(process.env.EMAIL_DELIVERY_MODE??'mock')!=='mock') throw new Error('This worker supports mock email only');
 const revision=process.env.CATALOG_GIT_SHA??'';
 if(!/^[a-f0-9]{7,64}$/.test(revision)) throw new Error('CATALOG_GIT_SHA is required');
 let digestConfig:DigestQueueConfig|undefined;
 const gateway=new MockEmailGateway();
 if(mode==='mock-pilot'){
  const origin=appOrigin(process.env.APP_URL??'');
  const unsubscribeSecret=process.env.UNSUBSCRIBE_SECRET??'';
  const senderIdentity=process.env.SENDER_IDENTITY??'',senderContact=process.env.SENDER_CONTACT??'';
  if(Buffer.byteLength(unsubscribeSecret)<32||!senderIdentity.trim()||!senderContact.trim()) throw new Error('Mock pilot requires signing key and sender identity/contact');
  digestConfig={origin,unsubscribeSecret,senderIdentity,senderContact,mode:'mock',publicEmailEnabled:false};
 }
 const db=getDatabase();let running=true;let lastCatalogSync=0;let lastReportRefresh=0;const shutdown=new AbortController();
 const stop=()=>{running=false;shutdown.abort();};
 process.once('SIGTERM',stop);process.once('SIGINT',stop);
 while(running){
  const now=new Date();
  try{
   await runWorkerJob(db,'worker-tick',async()=>{
   const counts={catalogEntries:0,polledSources:0,failedSources:0,insertedReleases:0,preparedDigests:0,acceptedDigests:0,skippedDigests:0,retriedDigests:0,failedDigests:0,reportDates:0};
   // Drain durable work before potentially slow source polling/report refreshes.
   if(digestConfig){
    for(let index=0;running&&index<25;index++){const prepared=await prepareDueDigest(db,digestConfig,new Date());if(prepared.status==='idle')break;if(prepared.status==='queued')counts.preparedDigests++;else counts.skippedDigests++;console.log(JSON.stringify({service:'labticker-worker',job:'digest-prepare',status:prepared.status,items:prepared.items}));}
    for(let index=0;running&&index<25;index++){const status=await sendOneDigest(db,gateway,digestConfig,new Date());if(status==='idle')break;if(status==='sent')counts.acceptedDigests++;if(status==='retry')counts.retriedDigests++;if(status==='failed')counts.failedDigests++;if(status==='skipped')counts.skippedDigests++;console.log(JSON.stringify({service:'labticker-worker',job:'digest-send',status}));}
    gateway.inbox.length=0; // Never expose or retain a process-local subscriber inbox.
   }
   if(now.getTime()-lastCatalogSync>=86400000){
    const count=await syncRegistry(db,await loadRegistry(),revision,now);lastCatalogSync=now.getTime();
    counts.catalogEntries=count;
    console.log(JSON.stringify({service:'labticker-worker',job:'catalog-sync',status:'ok',count}));
   }
   // Bound feed work per tick so large catalogs cannot starve due digest checks.
   for(let index=0;running&&index<5;index++){
    const result=await pollOneSource(db,undefined,new Date());
    if(result.status==='idle')break;
    counts.polledSources++;counts.insertedReleases+=result.inserted;if(result.status==='failed')counts.failedSources++;
    console.log(JSON.stringify({service:'labticker-worker',job:'release-poll',...result}));
   }
   if(running)await materializeSourceSnapshot(db,new Date());
   if(running&&now.getTime()-lastReportRefresh>=86400000){
    // Bootstrap both 30-day windows plus the 30-day retention maturity offset,
    // then revisit cohort maturation
    // plus 14 days for delayed engagement events on subsequent daily refreshes.
    const lookback=lastReportRefresh===0?90:45;
    for(let days=lookback;running&&days>=1;days--){await materializeDaily(db,new Date(now.getTime()-days*86400000).toISOString().slice(0,10),now);counts.reportDates++;}
    if(running){lastReportRefresh=now.getTime();console.log(JSON.stringify({service:'labticker-worker',job:'aggregate-refresh',status:'ok'}));}
   }
   return {value:undefined,counts};
   });
  }catch{console.error(JSON.stringify({service:'labticker-worker',status:'degraded',error:'Worker tick failed'}));}
  if(running) await delay(60000,undefined,{signal:shutdown.signal}).catch(()=>{});
 }
}
main().catch(()=>{console.error(JSON.stringify({service:'labticker-worker',status:'startup-failed'}));process.exitCode=1;}).finally(closeDatabase);

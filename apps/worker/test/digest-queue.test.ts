import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import * as s from '@labticker/database/schema';
import {MockEmailGateway} from '@labticker/notifications';
import type {EmailMessage} from '@labticker/notifications';
import {prepareDueDigest,claimDigest,deliverClaim,sendOneDigest} from '../src/digests.js';
import {ResendDigestGateway} from '@labticker/notifications/resend';
const now=new Date('2026-03-09T09:00:00Z');
const config={origin:'https://fixture.fly.dev',unsubscribeSecret:'fixture-only-signing-key-'.repeat(3),senderIdentity:'LabTicker fixture',senderContact:'Fictional fixture contact',leaseMs:1000};
test('mock receipts cannot count as real delivery or block an explicitly approved mode transition',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);assert.equal(await sendOneDigest(f.db,new MockEmailGateway(),config,now),'sent');
  await assert.rejects(prepareDueDigest(f.db,{...config,mode:'resend',publicEmailEnabled:true},now),/Approved/);
  let calls=0;const gateway=new ResendDigestGateway({mode:'resend',publicEmailEnabled:true,ownerApproval:{decision:'live-email-approved',reference:'fixture/owner-decision'},sender:{address:'updates@updates.example.org',domain:'updates.example.org',status:'verified',evidenceReference:'fixture/verification',checkedAt:'2026-03-01'},trackingReview:{reference:'fixture/tracking',authOpenTracking:false,authClickTracking:false,digestOpenTracking:false,digestClickTracking:false},appUrl:config.origin},{emails:{async send(){calls++;return {data:{id:'provider-fixture'},error:null};}}},now);
  const real={...config,mode:'resend',publicEmailEnabled:true,liveApproval:gateway.approval};
  const next=new Date(now.getTime()+1000);await f.db.update(s.preferences).set({nextDueAt:next}).where(eq(s.preferences.userId,f.user.id));
  assert.equal((await prepareDueDigest(f.db,real,next)).status,'queued');assert.equal(await claimDigest(f.db,config,next),null);
  const claim=await claimDigest(f.db,real,next);assert.ok(claim);
  await assert.rejects(deliverClaim(f.db,claim,new MockEmailGateway(),real,next),/Approved/);
  assert.equal(await deliverClaim(f.db,claim,gateway,real,next),'sent');assert.equal(calls,1);
  const receipts=await f.db.select().from(s.deliveryReceipts);assert.equal(receipts.length,2);assert.deepEqual(new Set(receipts.map(receipt=>receipt.deliveryMode)),new Set(['mock','resend']));
 }finally{await f.client.close();}
});
async function fixture(withRelease=true){
 const client=new PGlite();const db=drizzle(client,{schema:s});
 await migrate(db,{migrationsFolder:'../../drizzle'});
 const before=new Date('2026-03-08T09:00:00Z');
 const [user]=await db.insert(s.users).values({email:'queue-fixture@example.invalid',emailVerified:before,createdAt:before}).returning();assert.ok(user);
 await db.insert(s.emailConsents).values({userId:user.id,consentType:'digest',policyVersion:'fixture',consentedAt:before,source:'fixture'});
 await db.insert(s.preferences).values({userId:user.id,frequency:'daily',timezone:'UTC',enabled:true,nextDueAt:now});
 const [app]=await db.insert(s.applications).values({slug:'fixture',name:'Fixture',description:'Fixture description',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
 await db.insert(s.subscriptions).values({userId:user.id,applicationId:app.id,enabledAt:before});
 const [source]=await db.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',url:'https://api.github.com/repos/example/fixture/releases',externalKey:'example/fixture'}).returning();assert.ok(source);
 const releaseValues={applicationId:app.id,releaseSourceId:source.id,title:'A release',releaseUrl:'https://github.com/example/fixture/releases/tag/v1',notesText:'Fixture notes',firstSeenAt:new Date('2026-03-09T08:00:00Z'),isBackfill:false};
 if(withRelease)await db.insert(s.releases).values({...releaseValues,dedupeKey:'fixture-live'});
 return {client,db,user,app,source,releaseValues};
}
test('durable preparation reserves releases, persists immutable payload and avoids duplicate cadence windows',async()=>{
 const f=await fixture();try{
  const queued=await prepareDueDigest(f.db,config,now);assert.equal(queued.status,'queued');assert.equal(queued.items,1);
  assert.equal((await f.db.select().from(s.deliveryReceipts)).length,0);
  const [stored]=await f.db.select().from(s.digests);assert.ok(stored);assert.ok(stored.payload);
  await f.db.update(s.preferences).set({frequency:'weekly',nextDueAt:new Date(now.getTime()+1000)}).where(eq(s.preferences.userId,f.user.id));
  const next=await prepareDueDigest(f.db,config,new Date(now.getTime()+2000));assert.equal(next.status,'skipped');
  assert.deepEqual((await f.db.select().from(s.digests).where(eq(s.digests.id,stored.id)))[0]?.payload,stored.payload);
  const gateway=new MockEmailGateway();assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+3000)),'sent');
  assert.equal(gateway.inbox.length,1);assert.equal((await f.db.select().from(s.deliveryReceipts)).length,1);
  assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+4000)),'idle');
  assert.equal((await f.db.select().from(s.digestMessageEngagement))[0]?.trackedOpenEnabled,false);
 }finally{await f.client.close();}
});
test('ambiguous acceptance retries persisted JSONB payload with the same key and no premature receipt',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);
  const inner=new MockEmailGateway();let first=true;const seen:{payload:EmailMessage;key:string}[]=[];
  const gateway={async send(payload:EmailMessage,key:string){seen.push({payload:structuredClone(payload),key});const result=await inner.send(payload,key);if(first){first=false;throw Object.assign(new Error('Untrusted provider error and fixture address must not persist'),{disposition:'ambiguous'});}return result;}};
  assert.equal(await sendOneDigest(f.db,gateway,config,now),'retry');
  assert.equal((await f.db.select().from(s.deliveryReceipts)).length,0);
  const [waiting]=await f.db.select().from(s.digests);assert.ok(waiting?.nextAttemptAt);
  assert.ok(!waiting.lastError?.includes('fixture address'));
  assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+30000)),'idle');
  assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+60000)),'sent');
  assert.equal(inner.inbox.length,1);assert.deepEqual(seen[0],seen[1]);
  assert.equal((await f.db.select().from(s.deliveryReceipts)).length,1);
 }finally{await f.client.close();}
});
test('expired leases recover with fencing; old claims cannot send or acknowledge',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);const old=await claimDigest(f.db,config,now);assert.ok(old);
  assert.equal(await claimDigest(f.db,config,new Date(now.getTime()+500)),null);
  const fresh=await claimDigest(f.db,config,new Date(now.getTime()+2000));assert.ok(fresh);assert.notEqual(fresh.leaseToken,old.leaseToken);
  const gateway=new MockEmailGateway();
  assert.equal(await deliverClaim(f.db,old,gateway,config,new Date(now.getTime()+2100)),'stale');assert.equal(gateway.inbox.length,0);
  assert.equal(await deliverClaim(f.db,fresh,gateway,config,new Date(now.getTime()+2200)),'sent');assert.equal(gateway.inbox.length,1);
 }finally{await f.client.close();}
});
test('aged ambiguous attempts and permanent failures require review instead of blind resend',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);const claimed=await claimDigest(f.db,config,now);assert.ok(claimed);
  await f.db.update(s.digests).set({firstAttemptAt:new Date(now.getTime()-86400000)}).where(eq(s.digests.id,claimed.id));
  const gateway=new MockEmailGateway();assert.equal(await deliverClaim(f.db,claimed,gateway,config,now),'failed');assert.equal(gateway.inbox.length,0);
  assert.equal(await claimDigest(f.db,config,new Date(now.getTime()+2000)),null);
  assert.equal((await f.db.select().from(s.digests))[0]?.status,'failed');
  await f.db.update(s.digests).set({status:'pending',firstAttemptAt:null,attemptCount:0}).where(eq(s.digests.id,claimed.id));
  assert.equal(await sendOneDigest(f.db,{async send(){throw Object.assign(new Error('Unsafe detail'),{disposition:'permanent'});}},config,now),'failed');
  assert.equal((await f.db.select().from(s.deliveryReceipts)).length,0);
 }finally{await f.client.close();}
});
test('post-claim consent and monitor changes quarantine possible attempts without releasing reservations',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);const claim=await claimDigest(f.db,config,now);assert.ok(claim);
  await f.db.update(s.subscriptions).set({active:false,disabledAt:now}).where(eq(s.subscriptions.userId,f.user.id));
  const gateway=new MockEmailGateway();assert.equal(await deliverClaim(f.db,claim,gateway,config,now),'failed');assert.equal(gateway.inbox.length,0);
  // Resume cannot reinterpret a possible prior dispatch as safe for a new key.
  await f.db.update(s.subscriptions).set({active:true}).where(eq(s.subscriptions.userId,f.user.id));
  await f.db.update(s.preferences).set({nextDueAt:new Date(now.getTime()+1000)}).where(eq(s.preferences.userId,f.user.id));
  assert.equal((await prepareDueDigest(f.db,config,new Date(now.getTime()+2000))).status,'skipped');
  assert.equal(await claimDigest(f.db,config,new Date(now.getTime()+2000)),null);
  assert.equal(gateway.inbox.length,0);
 }finally{await f.client.close();}
});
test('ambiguous acceptance followed by selection change cannot receive a fresh idempotency key',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);const inner=new MockEmailGateway();
  const gateway={async send(payload:EmailMessage,key:string){await inner.send(payload,key);throw Object.assign(new Error('Lost acknowledgement'),{disposition:'ambiguous'});}};
  assert.equal(await sendOneDigest(f.db,gateway,config,now),'retry');assert.equal(inner.inbox.length,1);
  await f.db.update(s.subscriptions).set({active:false}).where(eq(s.subscriptions.userId,f.user.id));
  assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+60000)),'failed');
  await f.db.update(s.subscriptions).set({active:true}).where(eq(s.subscriptions.userId,f.user.id));
  await f.db.update(s.preferences).set({nextDueAt:new Date(now.getTime()+120000)}).where(eq(s.preferences.userId,f.user.id));
  assert.equal((await prepareDueDigest(f.db,config,new Date(now.getTime()+120000))).status,'skipped');
  assert.equal(await sendOneDigest(f.db,gateway,config,new Date(now.getTime()+120000)),'idle');
  assert.equal(inner.inbox.length,1);assert.equal((await f.db.select().from(s.deliveryReceipts)).length,0);
 }finally{await f.client.close();}
});
test('suppression is checked after claim and before any gateway operation',async()=>{
 const f=await fixture();try{
  await prepareDueDigest(f.db,config,now);const claim=await claimDigest(f.db,config,now);assert.ok(claim);
  await f.db.update(s.users).set({suppressedAt:now}).where(eq(s.users.id,f.user.id));
  const gateway=new MockEmailGateway();assert.equal(await deliverClaim(f.db,claim,gateway,config,now),'failed');
  assert.equal(gateway.inbox.length,0);assert.equal((await f.db.select().from(s.deliveryReceipts)).length,0);
 }finally{await f.client.close();}
});
test('empty/backfill/future/pre-subscription digests are skipped and the window advances',async()=>{
 const f=await fixture(false);try{
  await f.db.insert(s.releases).values([
   {...f.releaseValues,dedupeKey:'backfill',isBackfill:true},
   {...f.releaseValues,dedupeKey:'future',firstSeenAt:new Date(now.getTime()+1000)},
   {...f.releaseValues,dedupeKey:'before-monitor',firstSeenAt:new Date('2026-03-08T08:00:00Z')},
  ]);
  const prepared=await prepareDueDigest(f.db,config,now);assert.equal(prepared.status,'skipped');assert.equal(prepared.items,0);
  const [preference]=await f.db.select().from(s.preferences);assert.equal(preference?.nextDueAt?.toISOString(),'2026-03-10T09:00:00.000Z');
  assert.equal((await f.db.select().from(s.digestItems)).length,0);
  assert.equal((await prepareDueDigest(f.db,config,now)).status,'idle');
  await assert.rejects(()=>prepareDueDigest(f.db,{...config,mode:'resend'},now),/Public email/);
 }finally{await f.client.close();}
});
test('ordinary unsent history older than 30 days remains eligible after an outage',async()=>{
 const f=await fixture(false);try{
  const signup=new Date('2026-01-01T09:00:00Z');
  await f.db.update(s.users).set({createdAt:signup,emailVerified:signup}).where(eq(s.users.id,f.user.id));
  await f.db.update(s.subscriptions).set({enabledAt:signup}).where(eq(s.subscriptions.userId,f.user.id));
  const observed=new Date(now.getTime()-31*86400000);
  await f.db.insert(s.releases).values({...f.releaseValues,dedupeKey:'old-but-unseen',firstSeenAt:observed});
  const prepared=await prepareDueDigest(f.db,config,now);assert.equal(prepared.status,'queued');assert.equal(prepared.items,1);
  const [digest]=await f.db.select().from(s.digests);assert.ok(digest);assert.ok(digest.windowFrom<=observed);
  const gateway=new MockEmailGateway();assert.equal(await sendOneDigest(f.db,gateway,config,now),'sent');
  assert.equal(gateway.inbox.length,1);assert.equal((await f.db.select().from(s.deliveryReceipts)).length,1);
 }finally{await f.client.close();}
});
test('weekly overflow drains in minute windows without dropping unseen releases or duplicating receipts',async()=>{
 const f=await fixture(false);try{
  await f.db.update(s.preferences).set({frequency:'weekly'}).where(eq(s.preferences.userId,f.user.id));
  await f.db.insert(s.releases).values(Array.from({length:201},(_,index)=>({...f.releaseValues,dedupeKey:`overflow-${index}`,releaseUrl:`https://github.com/example/fixture/releases/tag/v${index}`,firstSeenAt:new Date(now.getTime()-(201-index)*1000)})));
  const gateway=new MockEmailGateway();
  for(const [step,expected] of [100,100,1].entries()){
   const stamp=new Date(now.getTime()+step*60000);
   const prepared=await prepareDueDigest(f.db,config,stamp);assert.equal(prepared.status,'queued');assert.equal(prepared.items,expected);
   const [preference]=await f.db.select().from(s.preferences);
   if(step<2)assert.equal(preference?.nextDueAt?.getTime(),stamp.getTime()+60000);
   assert.equal(await sendOneDigest(f.db,gateway,config,stamp),'sent');
  }
  assert.equal(gateway.inbox.length,3);assert.equal((await f.db.select().from(s.deliveryReceipts)).length,201);
  assert.equal((await f.db.select().from(s.preferences))[0]?.nextDueAt?.toISOString(),'2026-03-16T09:00:00.000Z');
 }finally{await f.client.close();}
});
test('SQL exclusions precede the bounded candidate limit and snapshots retain only note excerpts',async()=>{
 const f=await fixture(false);try{
  const excludedTime=new Date('2026-03-09T08:59:00Z');
  const flags=[{label:'Possible breaking change'}];
  const excluded=await f.db.insert(s.releases).values(Array.from({length:360},(_,index)=>({...f.releaseValues,dedupeKey:`excluded-${index}`,firstSeenAt:index<120?new Date('2026-03-07T09:00:00Z'):excludedTime,publishedAt:excludedTime,warningFlags:flags}))).returning({id:s.releases.id});
  const [deliveredDigest]=await f.db.insert(s.digests).values({userId:f.user.id,scheduledFor:new Date('2026-03-08T10:00:00Z'),windowFrom:new Date('2026-03-08T09:00:00Z'),windowTo:now,status:'sent',sentAt:now,idempotencyKey:'fixture-prior-sent',resendId:'fixture-accepted'}).returning();assert.ok(deliveredDigest);
  await f.db.insert(s.deliveryReceipts).values(excluded.slice(120,240).map(release=>({userId:f.user.id,releaseId:release.id,digestId:deliveredDigest.id,resendId:'fixture-accepted',acceptedAt:now})));
  const [reservedDigest]=await f.db.insert(s.digests).values({userId:f.user.id,scheduledFor:new Date('2026-03-08T11:00:00Z'),windowFrom:new Date('2026-03-08T09:00:00Z'),windowTo:now,status:'pending',idempotencyKey:'fixture-prior-pending'}).returning();assert.ok(reservedDigest);
  await f.db.insert(s.digestItems).values(excluded.slice(240).map(release=>({digestId:reservedDigest.id,releaseId:release.id,snapshot:{fixture:true}})));
  const fullNotes='Q'.repeat(250000);
  const live=await f.db.insert(s.releases).values([
   {...f.releaseValues,dedupeKey:'bounded-warning',title:'Warning release',notesText:fullNotes,firstSeenAt:new Date('2026-03-09T07:00:00Z'),warningFlags:flags},
   {...f.releaseValues,dedupeKey:'bounded-normal',title:'Normal release',notesText:'Plain live notes',firstSeenAt:new Date('2026-03-09T08:00:00Z')},
  ]).returning({id:s.releases.id});
  const prepared=await prepareDueDigest(f.db,config,now);assert.equal(prepared.status,'queued');assert.equal(prepared.items,2);assert.ok(prepared.id);
  const items=await f.db.select().from(s.digestItems).where(eq(s.digestItems.digestId,prepared.id));
  assert.deepEqual(items.map(item=>item.releaseId).sort(),live.map(release=>release.id).sort());
  for(const item of items)assert.ok((item.snapshot as {notes:string}).notes.length<=600);
  const [source]=await f.db.select({notes:s.releases.notesText}).from(s.releases).where(eq(s.releases.dedupeKey,'bounded-warning'));assert.equal(source?.notes,fullNotes);
  const [digest]=await f.db.select().from(s.digests).where(eq(s.digests.id,prepared.id));assert.ok(digest);
  const payload=digest.payload as EmailMessage;
  assert.ok(payload.html.indexOf('Warning release')<payload.html.indexOf('Normal release'));
  assert.ok(payload.html.length<10000);assert.ok(payload.text.length<10000);
  // Subsequent source-note edits do not regenerate a queued payload.
  await f.db.update(s.releases).set({notesText:'changed upstream'}).where(eq(s.releases.dedupeKey,'bounded-warning'));
  assert.deepEqual((await f.db.select().from(s.digests).where(eq(s.digests.id,prepared.id)))[0]?.payload,payload);
 }finally{await f.client.close();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as s from '../src/schema.js';import {readUserDigests} from '../src/digests.js';
test('private digest preview/history separates samples, simulations and provider deliveries without exposing other accounts',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const verified=new Date('2026-01-01'),enabledAt=new Date('2026-02-01'),now=new Date('2026-03-01');
 const [owner]=await db.insert(s.users).values({email:'owner@example.com',emailVerified:verified}).returning(),[other]=await db.insert(s.users).values({email:'other-private@example.com',emailVerified:verified}).returning(),[unverified]=await db.insert(s.users).values({email:'unverified@example.com'}).returning();assert.ok(owner&&other&&unverified);
 const releases=[];
 for(let index=0;index<2;index++){
  const [app]=await db.insert(s.applications).values({slug:`fixture-${index}`,name:`Fixture ${index}`,description:'Original fixture description',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  await db.insert(s.subscriptions).values({userId:owner.id,applicationId:app.id,enabledAt});
  const [source]=await db.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:`fixture/${index}`,url:`https://api.github.com/repos/fixture/${index}/releases`}).returning();assert.ok(source);
  const [release]=await db.insert(s.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:`fixture-${index}`,title:index===0?'A new update':'Older baseline sample',tag:'v1',releaseUrl:`https://github.com/fixture/${index}/releases/tag/v1`,notesText:'Bounded release notes',firstSeenAt:index===0?new Date('2026-02-15'):verified,publishedAt:verified,isBackfill:index!==0}).returning();assert.ok(release);releases.push(release);
 }
 const first=releases[0];assert.ok(first);
 const [simulated]=await db.insert(s.digests).values({userId:owner.id,scheduledFor:now,windowFrom:verified,windowTo:now,status:'sent',deliveryMode:'mock',idempotencyKey:'mock-fixture',resendId:'mock-fixture',sentAt:now,payload:{to:'owner@example.com',secret:'do-not-expose-token'}}).returning();assert.ok(simulated);
 await db.insert(s.deliveryReceipts).values({userId:owner.id,releaseId:first.id,digestId:simulated.id,deliveryMode:'mock',resendId:'mock-fixture',acceptedAt:now});
 await db.insert(s.digestMessageEngagement).values({digestId:simulated.id,deliveredAt:now}); // corrupted mock telemetry still must not imply real delivery
 await db.insert(s.digestItems).values({digestId:simulated.id,releaseId:first.id,snapshot:{appName:'Own fixture',title:'Own snapshot',notes:'Only safe rendered fields',version:'v1',releaseUrl:'javascript:alert(1)',email:'hidden-recipient@example.com',token:'do-not-expose-token'}});
 await db.insert(s.digests).values({userId:other.id,scheduledFor:now,windowFrom:verified,windowTo:now,status:'sent',deliveryMode:'resend',idempotencyKey:'private-other',payload:{secret:'other-private-payload'}});
 const before=(await db.select().from(s.digests)).length;
 const mock=await readUserDigests(db,owner.id,'mock',now);assert.equal(mock.upcoming.length,0);assert.equal(mock.sample.length,2);assert.ok(mock.sample.some(release=>release.title==='Older baseline sample'));assert.equal(mock.history.length,1);assert.equal(mock.history[0]?.mode,'mock');assert.equal(mock.history[0]?.deliveredAt,null);assert.equal(mock.history[0]?.items[0]?.url,null);
 const real=await readUserDigests(db,owner.id,'resend',now);assert.equal(real.upcoming.length,1);assert.equal((await db.select().from(s.digests)).length,before); // previews never queue or consume baseline history
 const serialized=JSON.stringify(mock);for(const secret of ['owner@example.com','other-private','do-not-expose-token','hidden-recipient','resendId','idempotencyKey','javascript:'])assert.ok(!serialized.includes(secret));
 await assert.rejects(readUserDigests(db,unverified.id,'mock',now),/Verified/);await assert.rejects(readUserDigests(db,'not-an-account','mock',now),/Verified/);
 }finally{await client.close();}
});

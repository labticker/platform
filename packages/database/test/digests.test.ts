import {test} from 'node:test';import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as s from '../src/schema.js';import * as schema from '../src/schema.js';import {readUserDigests} from '../src/digests.js';
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

test('release projections use publication chronology, missing-date fallback and stable ties',async()=>{

 const client=new PGlite(),db=drizzle(client,{schema});try{
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const now=new Date('2026-03-01'),enabledAt=new Date('2026-01-01');
  const [user]=await db.insert(schema.users).values({email:'chronology@example.com',emailVerified:enabledAt}).returning();assert.ok(user);
  const [app]=await db.insert(schema.applications).values({slug:'chronology',name:'Chronology',description:'Chronology fixture',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  const [source]=await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:'fixture/chronology',url:'https://api.github.com/repos/fixture/chronology/releases'}).returning();assert.ok(source);
  await db.insert(schema.subscriptions).values({userId:user.id,applicationId:app.id,enabledAt});
  const rows=[
   {title:'Older published, imported last',publishedAt:new Date('2026-01-10'),firstSeenAt:new Date('2026-02-28')},
   {title:'Publication missing',publishedAt:null,firstSeenAt:new Date('2026-02-10')},
   {title:'Same publication, older import',publishedAt:new Date('2026-02-20'),firstSeenAt:new Date('2026-02-21')},
   {title:'Latest tie A',publishedAt:new Date('2026-02-20'),firstSeenAt:new Date('2026-02-22')},
   {title:'Latest tie B',publishedAt:new Date('2026-02-20'),firstSeenAt:new Date('2026-02-22')},
  ];
  await db.insert(schema.releases).values(rows.map((row,index)=>({...row,id:`00000000-0000-4000-8000-${String(index+1).padStart(12,'0')}`,applicationId:app.id,releaseSourceId:source.id,dedupeKey:row.title,releaseUrl:'https://example.com/release',notesText:'Fixture notes',isBackfill:false})));
  const expected=['Latest tie A','Latest tie B','Same publication, older import','Publication missing','Older published, imported last'];
  const preview=await readUserDigests(db,user.id,'mock',now);
  assert.deepEqual(preview.upcoming.map(release=>release.title),expected);
  assert.equal(preview.sample[0]?.title,expected[0]);
  // IDs oppose chronology; the sample must sort after selecting one release per app.
  for(const [id,title,publishedAt,firstSeenAt] of [
   ['00000000-0000-4000-8000-000000000010','Earlier application sample',new Date('2026-02-05'),new Date('2026-02-28')],
   ['ffffffff-ffff-4fff-8fff-ffffffffffff','Latest application sample',null,new Date('2026-02-25')],
  ] as const){
   await db.insert(schema.applications).values({id,slug:title.startsWith('Earlier')?'earlier':'latest',name:title,description:'Cross-application chronology',category:'monitoring',homepageUrl:'https://example.com'});
   await db.insert(schema.subscriptions).values({userId:user.id,applicationId:id,enabledAt});
   const [feed]=await db.insert(schema.releaseSources).values({applicationId:id,provider:'github-releases',externalKey:id,url:'https://api.github.com/repos/fixture/chronology/releases'}).returning();assert.ok(feed);
   await db.insert(schema.releases).values({applicationId:id,releaseSourceId:feed.id,dedupeKey:title,title,publishedAt,firstSeenAt,releaseUrl:'https://example.com/release',notesText:'Sample notes'});
  }
  const crossApp=await readUserDigests(db,user.id,'mock',now);
  assert.deepEqual(crossApp.sample.map(release=>release.title),['Latest application sample','Latest tie A','Earlier application sample']);
  assert.deepEqual(Object.keys(crossApp.sample[0]??{}).sort(),['appName','notes','publishedAt','title','url','version','warnings']);
  assert.equal((await db.select().from(schema.digests)).length,0);
 }finally{await client.close();}
});

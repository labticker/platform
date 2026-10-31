import assert from 'node:assert/strict';
import postgres from 'postgres';
import {drizzle} from 'drizzle-orm/postgres-js';
import {migrate} from 'drizzle-orm/postgres-js/migrator';
import {eq} from 'drizzle-orm';
import * as s from '../packages/database/src/schema.js';
import {prepareDueDigest,claimDigest,deliverClaim} from '../apps/worker/src/digests.js';
import {MockEmailGateway} from '../packages/notifications/src/core.js';

// Explicit disposable local database only. Never read production credentials or mutate
// an existing database: this test refuses any pre-existing public tables.
if(process.env.LOCAL_DB_FIXTURE_ENABLED!=='true'||process.env.NODE_ENV==='production')throw new Error('Disposable local fixture opt-in required');
const clientA=postgres('postgresql://postgres@127.0.0.1:55433/postgres',{max:1,prepare:false,connect_timeout:5});
const clientB=postgres('postgresql://postgres@127.0.0.1:55433/postgres',{max:1,prepare:false,connect_timeout:5});
const dbA=drizzle(clientA,{schema:s}),dbB=drizzle(clientB,{schema:s});
try{
 const [tables]=await clientA<{count:number}[]>`select count(*)::int as count from information_schema.tables where table_schema='public'`;
 assert.equal(tables?.count,0,'Fixture database must be empty');
 await migrate(dbA,{migrationsFolder:'drizzle'});
 const now=new Date('2026-10-31T12:00:00Z'),before=new Date(now.getTime()-86400000);
 const [app]=await dbA.insert(s.applications).values({slug:'concurrency-fixture',name:'Concurrency Fixture',description:'Disposable acceptance project',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
 const [source]=await dbA.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',url:'https://api.github.com/repos/example/fixture/releases',externalKey:'example/fixture'}).returning();assert.ok(source);
 const [release]=await dbA.insert(s.releases).values({applicationId:app.id,releaseSourceId:source.id,sourceGuid:'fixture-1',dedupeKey:'fixture-1',tag:'v1.0.0',title:'Fixture',releaseUrl:'https://github.com/example/fixture/releases/tag/v1.0.0',notesText:'Fixture only',firstSeenAt:new Date(now.getTime()-1000),isBackfill:false}).returning();assert.ok(release);
 async function account(email:string,due:Date){
  const [user]=await dbA.insert(s.users).values({email,emailVerified:before,createdAt:before}).returning();assert.ok(user);
  await dbA.insert(s.preferences).values({userId:user.id,frequency:'daily',timezone:'UTC',enabled:true,nextDueAt:due});
  await dbA.insert(s.emailConsents).values({userId:user.id,consentType:'digest',policyVersion:'fixture-v1',source:'local-test',consentedAt:before});
  await dbA.insert(s.subscriptions).values({userId:user.id,applicationId:app.id,enabledAt:before});return user;
 }
 const first=await account('first@example.invalid',now);
 const config={origin:'https://example.com',unsubscribeSecret:'local-fixture-only-signing-key-0000000000',senderIdentity:'Local fixture',senderContact:'Fixture only, no sends',mode:'mock'};
 const prepared=await Promise.all([prepareDueDigest(dbA,config,now),prepareDueDigest(dbB,config,now)]);
 assert.equal(prepared.filter(r=>r.status==='queued').length,1);
 assert.equal((await dbA.select().from(s.digests)).length,1);
 const claims=await Promise.all([claimDigest(dbA,config,now),claimDigest(dbB,config,now)]);
 assert.equal(claims.filter(Boolean).length,1);const claim=claims.find(c=>c!==null);assert.ok(claim);
 const gateway=new MockEmailGateway();
 const dispatch=await Promise.all([deliverClaim(dbA,claim,gateway,config,now),deliverClaim(dbB,claim,gateway,config,now)]);
 assert.equal(dispatch.filter(r=>r==='sent').length,1);assert.equal(gateway.inbox.length,1);
 assert.equal((await dbA.select().from(s.deliveryReceipts)).length,1);

 // A locked oldest account must not prevent another ready account being claimed.
 const next=new Date(now.getTime()+86400000);
 const second=await account('second@example.invalid',new Date(now.getTime()+3600000));
 await dbA.insert(s.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:'fixture-2',title:'Fixture 2',releaseUrl:'https://github.com/example/fixture/releases/tag/v2.0.0',notesText:'Fixture only',firstSeenAt:new Date(next.getTime()-1000),isBackfill:false});
 assert.equal((await prepareDueDigest(dbA,config,next)).status,'queued');
 assert.equal((await prepareDueDigest(dbA,config,next)).status,'queued');
 let unlock!:()=>void,locked!:()=>void;
 const acquired=new Promise<void>(resolve=>{locked=resolve;});const hold=new Promise<void>(resolve=>{unlock=resolve;});
 const blocker=dbA.transaction(async tx=>{await tx.select({id:s.users.id}).from(s.users).where(eq(s.users.id,second.id)).for('update');locked();await hold;});
 try{await acquired;const other=await claimDigest(dbB,config,next);assert.equal(other?.userId,first.id);}finally{unlock();await blocker;}
 console.log('PostgreSQL acceptance passed: concurrent preparation, fenced dispatch, one receipt and locked-user skipping');
}catch{console.error('Disposable PostgreSQL acceptance failed; fixture assertions need review');process.exitCode=1;}
finally{await Promise.all([clientA.end({timeout:5}),clientB.end({timeout:5})]);}

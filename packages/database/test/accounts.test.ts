import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import * as schema from '../src/schema.js';
import {setMonitor,savePreferences,suppressAccount,accountDashboard,deleteAccount} from '../src/accounts.js';
import {mockAuthAllowed,assertSameOrigin} from '../src/auth-policy.js';
test('test-only authentication fails closed in production and foreign origins',()=>{
 const env={NODE_ENV:'development',AUTH_TEST_MODE:'true',DATABASE_URL:'postgres://fixture',AUTH_SECRET:'x'.repeat(32),APP_URL:'http://localhost:3000'};
 assert.equal(mockAuthAllowed(env),true);
 for(const patch of [{NODE_ENV:'production'},{APP_URL:'https://public.fly.dev'},{AUTH_TEST_MODE:'false'},{AUTH_SECRET:'short'},{APP_URL:'http://localhost:3000/path'}])assert.equal(mockAuthAllowed({...env,...patch}),false);
 assert.throws(()=>assertSameOrigin('https://evil.example','http://localhost:3000'));
 assert.throws(()=>assertSameOrigin(null,'http://localhost:3000'));
 assertSameOrigin('http://localhost:3000','http://localhost:3000');
});
test('account repository authorizes monitors, records consent/state and preserves suppression',async()=>{
 const client=new PGlite();const db=drizzle(client,{schema});
 try{
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const now=new Date('2026-01-01T00:00:00Z');
  const [user]=await db.insert(schema.users).values({email:'test@example.com',emailVerified:now}).returning();assert.ok(user);
  const [unverified]=await db.insert(schema.users).values({email:'unverified@example.com'}).returning();assert.ok(unverified);
  const [app]=await db.insert(schema.applications).values({slug:'fixture',name:'Fixture',description:'Fixture description',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
  await assert.rejects(()=>setMonitor(db,user.id,app.id,true,now),/No supported/);
  await db.insert(schema.releaseSources).values({applicationId:app.id,provider:'github-releases',url:'https://api.github.com/repos/example/fixture/releases',externalKey:'example/fixture'});
  await assert.rejects(()=>setMonitor(db,unverified.id,app.id,true,now),/Verified/);
  await setMonitor(db,user.id,app.id,true,now);await setMonitor(db,user.id,app.id,true,new Date(now.getTime()+1000));
  let state=await accountDashboard(db,user.id);assert.equal(state.monitors.length,1);assert.equal(state.monitors[0]?.enabledAt.getTime(),now.getTime());
  await assert.rejects(()=>savePreferences(db,user.id,{frequency:'weekly',timezone:'UTC',enabled:true,consent:false,nextDueAt:new Date('2026-01-05')},now),/Consent/);
  await savePreferences(db,user.id,{frequency:'weekly',timezone:'UTC',enabled:true,consent:true,nextDueAt:new Date('2026-01-05')},now);
  assert.equal((await db.select().from(schema.emailConsents))[0]?.policyVersion,'digest-v1');
  assert.equal((await accountDashboard(db,user.id)).consented,true);
  await db.insert(schema.digests).values([
   {userId:user.id,scheduledFor:new Date('2026-01-01T09:00Z'),windowFrom:now,windowTo:now,idempotencyKey:'fixture-attempted',status:'claimed',firstAttemptAt:now,leaseToken:'00000000-0000-4000-8000-000000000001',claimUntil:new Date('2026-01-02')},
   {userId:user.id,scheduledFor:new Date('2026-01-01T10:00Z'),windowFrom:now,windowTo:now,idempotencyKey:'fixture-unsent',status:'pending'},
  ]);
  await suppressAccount(db,user.id,new Date('2026-01-02'));state=await accountDashboard(db,user.id);assert.equal(state.suppressed,true);assert.equal(state.preferences?.enabled,false);
  const canceled=await db.select().from(schema.digests);assert.equal(canceled.find(d=>d.idempotencyKey==='fixture-attempted')?.status,'failed');assert.equal(canceled.find(d=>d.idempotencyKey==='fixture-unsent')?.status,'skipped');assert.ok(canceled.every(d=>d.leaseToken===null&&d.claimUntil===null));
  await assert.rejects(()=>savePreferences(db,user.id,{frequency:'daily',timezone:'UTC',enabled:true,consent:true,nextDueAt:new Date('2026-01-05')},now),/unsuppressed/);
  const events=await db.select().from(schema.accountStateEvents).where(eq(schema.accountStateEvents.userId,user.id));assert.equal(events.length,3);assert.equal(events.at(-1)?.suppressed,true);
  await deleteAccount(db,user.id,new Date('2026-01-03'));await assert.rejects(()=>accountDashboard(db,user.id),/Verified/);const [deleted]=await db.select().from(schema.users).where(eq(schema.users.id,user.id));assert.equal(deleted?.email,user.id+'@deleted.invalid');assert.equal(deleted?.emailVerified?.getTime(),now.getTime());assert.equal((await db.select().from(schema.subscriptions)).length,0);
 }finally{await client.close();}
});




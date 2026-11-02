import {test} from 'node:test';import assert from 'node:assert/strict';import {randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';import {eq} from 'drizzle-orm';
import * as s from '../src/schema.js';import {emailTestingAllowed,enqueueEmailTest,readEmailTestHistory} from '../src/email-testing.js';
test('private test history excludes payload/provider and belongs to verified account; frozen payload enforced',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const [owner]=await db.insert(s.users).values({email:'private-fixture@example.com',emailVerified:new Date(),role:'admin'}).returning();assert.ok(owner);
 const [other]=await db.insert(s.users).values({email:'other@example.com',emailVerified:new Date()}).returning();assert.ok(other);
 const [row]=await db.insert(s.emailTestMessages).values({userId:owner.id,requestId:randomUUID(),payload:{to:owner.email,secret:'private-token'},providerId:'provider-private'}).returning();assert.ok(row);
 await db.insert(s.emailTestMessages).values({userId:other.id,requestId:randomUUID(),payload:{secret:'other-private'}});
 const history=await readEmailTestHistory(db,owner.id);assert.equal(history.length,1);assert.equal(history[0]?.id,row.id);
 for(const value of ['private-token','provider-private','private-fixture','other-private','payload','providerId'])assert.ok(!JSON.stringify(history).includes(value));
 await assert.rejects(db.update(s.emailTestMessages).set({payload:{changed:true}}).where(eq(s.emailTestMessages.id,row.id)),(error:unknown)=>error instanceof Error&&'cause' in error&&String(error.cause).includes('immutable'));
 assert.equal(emailTestingAllowed({},owner),false);assert.deepEqual(await enqueueEmailTest(db,{userId:owner.id,consent:true,requestId:randomUUID()},{}),{status:'disabled'});
 assert.equal((await db.select().from(s.digests)).length,0);assert.equal((await db.select().from(s.deliveryReceipts)).length,0);assert.equal((await db.select().from(s.emailConsents)).length,0);
 const {deleteAccount}=await import('../src/accounts.js');await deleteAccount(db,owner.id);assert.equal((await readEmailTestHistory(db,other.id)).length,1);assert.equal((await db.select().from(s.emailTestMessages).where(eq(s.emailTestMessages.userId,owner.id))).length,0);
 }finally{await client.close();}
});

test('private tests use selected historical samples, idempotency, quotas and suppression without ordinary digest state',async()=>{
 const {emailTestFixture}=await import('./email-testing-fixture.js');const env=emailTestFixture();
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const now=new Date(),[user]=await db.insert(s.users).values({email:'owner@example.com',role:'admin',emailVerified:now}).returning();assert.ok(user);
 const [app]=await db.insert(s.applications).values({slug:'test-sample',name:'Sample',description:'Fixture',category:'monitoring',homepageUrl:'https://example.com'}).returning();assert.ok(app);
 await db.insert(s.subscriptions).values({userId:user.id,applicationId:app.id,enabledAt:now});
 const [source]=await db.insert(s.releaseSources).values({applicationId:app.id,provider:'github-releases',externalKey:'fixture',url:'https://github.com/example/test/releases'}).returning();assert.ok(source);
 await db.insert(s.releases).values({applicationId:app.id,releaseSourceId:source.id,dedupeKey:'old',title:'Historical sample',releaseUrl:'https://github.com/example/test/releases/tag/v1',notesText:'Fixture',firstSeenAt:new Date(now.getTime()-86400000),isBackfill:true});
 const requestId=randomUUID();assert.deepEqual(await enqueueEmailTest(db,{userId:user.id,requestId,consent:true},env,now),{status:'queued'});
 assert.deepEqual(await enqueueEmailTest(db,{userId:user.id,requestId,consent:true},env,now),{status:'already-queued'});
 for(let i=0;i<2;i++)assert.deepEqual(await enqueueEmailTest(db,{userId:user.id,requestId:randomUUID(),consent:true},env,now),{status:'queued'});
 assert.deepEqual(await enqueueEmailTest(db,{userId:user.id,requestId:randomUUID(),consent:true},env,now),{status:'rate-limited'});
 const [row]=await db.select().from(s.emailTestMessages);assert.ok(row);assert.match(JSON.stringify(row.payload),/\[TEST\]/);assert.match(JSON.stringify(row.payload),/Historical sample/);assert.match((row.payload as {html:string}).html,/^<!doctype html><html><body><p><strong>PRIVATE EMAIL TEST/);
 assert.equal((await db.select().from(s.digests)).length,0);assert.equal((await db.select().from(s.deliveryReceipts)).length,0);assert.equal((await db.select().from(s.preferences)).length,0);assert.equal((await db.select().from(s.emailConsents)).length,0);
 await db.update(s.users).set({suppressedAt:now}).where(eq(s.users.id,user.id));assert.deepEqual(await enqueueEmailTest(db,{userId:user.id,requestId:randomUUID(),consent:true},env,now),{status:'suppressed'});
 }finally{await client.close();}
});

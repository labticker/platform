import {test} from 'node:test';import assert from 'node:assert/strict';import {sendOneEmailTest} from '../src/email-testing.js';
import type {PgDatabase,PgQueryResultHKT} from 'drizzle-orm/pg-core';import * as s from '@labticker/database/schema';
test('disabled private test worker never queries or dispatches',async()=>{
 let called=false;const gateway={send:async()=>{called=true;return {id:'fixture'};}};
 const result=await sendOneEmailTest({} as PgDatabase<PgQueryResultHKT,typeof s>,gateway,{});assert.equal(result,'idle');assert.equal(called,false);
});
import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';import {eq} from 'drizzle-orm';import {randomUUID} from 'node:crypto';import {emailTestFixture} from '../../../packages/database/test/email-testing-fixture.js';
test('private test retries freeze provider payload/key and leave ordinary receipts empty; suppression blocks pending send',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
 const now=new Date(),env=emailTestFixture(),[user]=await db.insert(s.users).values({email:'owner@example.com',role:'admin',emailVerified:now}).returning();assert.ok(user);
 const payload={to:user.email,subject:'[TEST] Fixture',html:'<p>Private test</p>',text:'Private test',headers:{'List-Unsubscribe':'<https://fixture.fly.dev/unsubscribe?token=fixture>'}};
 const [row]=await db.insert(s.emailTestMessages).values({userId:user.id,requestId:randomUUID(),payload,createdAt:now}).returning();assert.ok(row);
 const attempts:{payload:unknown;key:string}[]=[];const gateway={send:async(message:import('@labticker/notifications').EmailMessage,key:string)=>{attempts.push({payload:message,key});if(attempts.length===1)throw new Error('ambiguous fixture');return {id:'provider-fixture'};}};
 assert.equal(await sendOneEmailTest(db,gateway,env,now),'retry');assert.equal(await sendOneEmailTest(db,gateway,env,new Date(now.getTime()+61000)),'sent');assert.deepEqual(attempts[0],attempts[1]);assert.equal(attempts[0]?.key,`email-test/${row.id}`);
 assert.equal((await db.select().from(s.deliveryReceipts)).length,0);assert.equal((await db.select().from(s.digests)).length,0);
 await db.insert(s.emailTestMessages).values({userId:user.id,requestId:randomUUID(),payload,createdAt:now});await db.update(s.users).set({suppressedAt:now}).where(eq(s.users.id,user.id));assert.equal(await sendOneEmailTest(db,gateway,env,now),'skipped');assert.equal(attempts.length,2);
 }finally{await client.close();}
});

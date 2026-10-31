import {test} from 'node:test';
import assert from 'node:assert/strict';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import * as s from '../src/schema.js';
import {runWorkerJob,readOperations,safeJobCounts} from '../src/operations.js';
test('durable jobs redact arbitrary fields/errors and report missing, failed and stale heartbeats to admins only',async()=>{
 const client=new PGlite();const db=drizzle(client,{schema:s});
 try{
  await migrate(db,{migrationsFolder:'../../drizzle'});const now=new Date('2026-10-31T12:00Z');
  const [admin]=await db.insert(s.users).values({email:'admin@example.invalid',role:'admin',emailVerified:now}).returning();assert.ok(admin);
  const [user]=await db.insert(s.users).values({email:'user@example.invalid',emailVerified:now}).returning();assert.ok(user);
  await assert.rejects(readOperations(db,user.id,now),/Administrator/);
  assert.equal((await readOperations(db,admin.id,now)).heartbeat,'missing');
  assert.equal(await runWorkerJob(db,'worker-tick',async()=>({value:'ok',counts:{acceptedDigests:1}}),()=>now),'ok');
  assert.equal((await readOperations(db,admin.id,now)).heartbeat,'recent');
  assert.equal((await readOperations(db,admin.id,new Date(now.getTime()+31*60000))).heartbeat,'stale');
  assert.deepEqual(safeJobCounts({acceptedDigests:2,email:'private@example.com',payload:'secret',failedDigests:NaN,reportDates:-1}),{acceptedDigests:2});
  const later=new Date(now.getTime()+1000);
  await assert.rejects(runWorkerJob(db,'worker-tick',async()=>{throw new Error('private@example.com secret');},()=>later),/^Error: Worker job failed$/);
  const result=await readOperations(db,admin.id,later);assert.equal(result.heartbeat,'failed');assert.equal(result.productionReady,false);
  const records=await db.select().from(s.jobRuns);assert.ok(!JSON.stringify(records).includes('private@example.com'));assert.ok(records.some(r=>r.error==='Worker job failed'));
  await db.update(s.users).set({role:'user'}).where(eq(s.users.id,admin.id));await assert.rejects(readOperations(db,admin.id,later),/Administrator/);
 }finally{await client.close();}
});

import {test} from 'node:test';import assert from 'node:assert/strict';import {PGlite} from '@electric-sql/pglite';import {drizzle} from 'drizzle-orm/pglite';import {migrate} from 'drizzle-orm/pglite/migrator';
import * as s from '@labticker/database/schema';import {pruneOperationalData} from '../src/retention.js';
test('retention removes old accepted payloads and processed webhooks while preserving retry/quarantine and recent evidence',async()=>{
 const client=new PGlite(),db=drizzle(client,{schema:s});try{await migrate(db,{migrationsFolder:'../../drizzle'});
  const now=new Date('2026-10-31'),old=new Date('2026-08-01'),recent=new Date('2026-10-30');
  const [user]=await db.insert(s.users).values({email:'retention@example.invalid'}).returning();assert.ok(user);
  for(const [i,status] of ['sent','pending','claimed','failed','skipped'].entries())await db.insert(s.digests).values({userId:user.id,scheduledFor:new Date(old.getTime()+i*1000),windowFrom:old,windowTo:old,status,sentAt:status==='sent'?old:null,idempotencyKey:`retention-${status}`,payload:{to:'retention@example.invalid',fixture:true}});
  for(const [i,status] of ['processed','pending','ignored'].entries())await db.insert(s.resendWebhookEvents).values({providerEventId:`retention-${i}`,eventType:'email.sent',resendEmailId:'fixture',receivedAt:old,processedAt:status==='pending'?null:old,processingStatus:status});
  await db.insert(s.resendWebhookEvents).values({providerEventId:'recent',eventType:'email.sent',resendEmailId:'fixture',receivedAt:recent,processedAt:recent,processingStatus:'processed'});
  await db.insert(s.authEmailMessages).values([{providerId:'old-auth-fixture',acceptedAt:old},{providerId:'recent-auth-fixture',acceptedAt:recent}]);
  for(const status of ['sent','pending','claimed','failed','skipped'])await db.insert(s.emailTestMessages).values({userId:user.id,requestId:crypto.randomUUID(),payload:{fixture:true},createdAt:old,status});
  assert.deepEqual(await pruneOperationalData(db,now),{payloadsCleared:2,webhooksPruned:2,authenticationAcksPruned:1});
  assert.deepEqual((await db.select().from(s.authEmailMessages)).map(row=>row.providerId),['recent-auth-fixture']);
  assert.deepEqual((await db.select().from(s.emailTestMessages)).map(row=>row.status).sort(),['claimed','failed','pending']);
  const digests=await db.select().from(s.digests);for(const row of digests)assert.equal(row.payload!==null,['pending','claimed','failed'].includes(row.status));
  const events=await db.select().from(s.resendWebhookEvents);assert.deepEqual(events.map(e=>e.providerEventId).sort(),['recent','retention-1']);
 }finally{await client.close();}
});

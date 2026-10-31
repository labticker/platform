import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {PGlite} from '@electric-sql/pglite';
import {drizzle} from 'drizzle-orm/pglite';
import {migrate} from 'drizzle-orm/pglite/migrator';
import {eq} from 'drizzle-orm';
import * as schema from '@labticker/database/schema';
import {MAX_WEBHOOK_BYTES,processResendEvent,readWebhookBody,RetryableWebhook,verifyResendWebhook} from '../src/index.js';
const key=Buffer.from('fixture-webhook-secret-32-byte-key');const secret=`whsec_${key.toString('base64')}`;
function signed(type='email.delivered',emailId='fixture-message',createdAt=new Date(),ageSeconds=0){
 const id=`msg_${randomUUID()}`;const timestamp=String(Math.floor(Date.now()/1000)-ageSeconds);
 const payload=JSON.stringify({type,created_at:createdAt.toISOString(),data:{email_id:emailId,to:['private@example.com'],click:{link:'https://private.example.com/token=secret'},ip:'192.0.2.1'}});
 const signature=createHmac('sha256',key).update(`${id}.${timestamp}.${payload}`).digest('base64');
 return {payload,headers:new Headers({'svix-id':id,'svix-timestamp':timestamp,'svix-signature':`v1,${signature}`})};
}
test('official SDK accepts real signatures and rejects body mutations, stale replays and bad headers',()=>{
 const input=signed();assert.equal(verifyResendWebhook(input.payload,input.headers,secret).emailId,'fixture-message');
 assert.throws(()=>verifyResendWebhook(`${input.payload} `,input.headers,secret));
 const old=signed('email.delivered','fixture-message',new Date(),600);assert.throws(()=>verifyResendWebhook(old.payload,old.headers,secret));
 assert.throws(()=>verifyResendWebhook(input.payload,new Headers(),secret));
 assert.throws(()=>verifyResendWebhook('x'.repeat(MAX_WEBHOOK_BYTES+1),input.headers,secret));
});
test('streaming payload reader bounds actual bytes independent of content length',async()=>{
 assert.equal(await readWebhookBody(new Request('https://example.com',{method:'POST',body:'fixture'})),'fixture');
 await assert.rejects(readWebhookBody(new Request('https://example.com',{method:'POST',body:'x'.repeat(MAX_WEBHOOK_BYTES+1)})));
});
test('signed webhook processing dedupes and retains earliest delivery, gates tracking, suppresses complaints without retaining PII',async()=>{
 const client=new PGlite();const db=drizzle(client,{schema});
 try {
  await migrate(db,{migrationsFolder:'../../drizzle'});
  const [user]=await db.insert(schema.users).values({email:'fixture@example.com',emailVerified:new Date()}).returning();assert.ok(user);
  await db.insert(schema.preferences).values({userId:user.id,enabled:true,nextDueAt:new Date()});
  await db.insert(schema.emailConsents).values({userId:user.id,consentType:'digest',policyVersion:'fixture',source:'test',consentedAt:new Date()});
  const [digest]=await db.insert(schema.digests).values({userId:user.id,scheduledFor:new Date(),windowFrom:new Date(0),windowTo:new Date(),idempotencyKey:'fixture',resendId:'fixture-message',status:'sent'}).returning();assert.ok(digest);
  const [queued]=await db.insert(schema.digests).values({userId:user.id,scheduledFor:new Date(Date.now()+10000),windowFrom:new Date(0),windowTo:new Date(),idempotencyKey:'fixture-queued',status:'claimed'}).returning();assert.ok(queued);
  const deliver=signed('email.delivered','fixture-message',new Date(Date.now()-1000));const event=verifyResendWebhook(deliver.payload,deliver.headers,secret);
  assert.equal(await processResendEvent(db,event),'processed');assert.equal(await processResendEvent(db,event),'duplicate');
  const earlier=signed('email.delivered','fixture-message',new Date(Date.now()-10000));await processResendEvent(db,verifyResendWebhook(earlier.payload,earlier.headers,secret));
  const opened=signed('email.opened');await processResendEvent(db,verifyResendWebhook(opened.payload,opened.headers,secret));
  assert.equal((await db.select().from(schema.digestMessageEngagement))[0]?.firstOpenedAt,null);
  const untrackedClick=signed('email.clicked');await processResendEvent(db,verifyResendWebhook(untrackedClick.payload,untrackedClick.headers,secret));
  assert.equal((await db.select().from(schema.digestMessageEngagement))[0]?.firstClickedAt,null);
  await db.update(schema.digestMessageEngagement).set({trackedClickEnabled:true}).where(eq(schema.digestMessageEngagement.digestId,digest.id));
  const clicked=signed('email.clicked');await processResendEvent(db,verifyResendWebhook(clicked.payload,clicked.headers,secret));
  const engagement=(await db.select().from(schema.digestMessageEngagement))[0];assert.ok(engagement?.firstClickedAt);assert.equal(engagement.deliveredAt?.toISOString(),JSON.parse(earlier.payload).created_at);
  await db.update(schema.digestMessageEngagement).set({trackedOpenEnabled:true}).where(eq(schema.digestMessageEngagement.digestId,digest.id));
  const trackedOpen=signed('email.opened');await processResendEvent(db,verifyResendWebhook(trackedOpen.payload,trackedOpen.headers,secret));
  assert.ok((await db.select().from(schema.digestMessageEngagement))[0]?.firstOpenedAt);
  const complaint=signed('email.complained');await processResendEvent(db,verifyResendWebhook(complaint.payload,complaint.headers,secret));
  assert.ok((await db.select().from(schema.users))[0]?.suppressedAt);assert.equal((await db.select().from(schema.preferences))[0]?.enabled,false);assert.ok((await db.select().from(schema.emailConsents))[0]?.withdrawnAt);
  assert.equal((await db.select().from(schema.digests).where(eq(schema.digests.id,queued.id)))[0]?.status,'skipped');
  assert.equal((await db.select().from(schema.digests).where(eq(schema.digests.id,digest.id)))[0]?.status,'sent');
  const bounce=signed('email.bounced');await processResendEvent(db,verifyResendWebhook(bounce.payload,bounce.headers,secret));
  assert.ok((await db.select().from(schema.digestMessageEngagement))[0]?.bouncedAt);
  assert.equal((await db.select().from(schema.accountStateEvents)).length,2);
  const storage=JSON.stringify(await db.select().from(schema.resendWebhookEvents));assert.ok(!storage.includes('private@example.com'));assert.ok(!storage.includes('192.0.2.1'));assert.ok(!storage.includes('token=secret'));
  const unknown=signed('email.future_event');assert.equal(await processResendEvent(db,verifyResendWebhook(unknown.payload,unknown.headers,secret)),'ignored');
  const racing=signed('email.delivered','not-yet-acknowledged');const before=(await db.select().from(schema.resendWebhookEvents)).length;
  await assert.rejects(processResendEvent(db,verifyResendWebhook(racing.payload,racing.headers,secret)),RetryableWebhook);
  assert.equal((await db.select().from(schema.resendWebhookEvents)).length,before);
  await db.update(schema.digests).set({resendId:'not-yet-acknowledged'}).where(eq(schema.digests.id,digest.id));
  assert.equal(await processResendEvent(db,verifyResendWebhook(racing.payload,racing.headers,secret)),'processed');
 }finally{await client.close();}
});
